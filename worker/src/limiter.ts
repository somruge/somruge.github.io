import { DurableObject } from "cloudflare:workers";

// One instance per visitor per UTC day, named by a salted IP hash (BR-02), plus one per day
// named "quota:<day>" that remembers the Workers AI free allocation ran out.
// Everything an instance stores is deleted 24 hours after its first write.
export class Limiter extends DurableObject {
  private table() {
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS c (n INTEGER NOT NULL)");
  }

  private count(): number | null {
    this.table();
    const row = this.ctx.storage.sql.exec<{ n: number }>("SELECT n FROM c").toArray()[0];
    return row ? row.n : null;
  }

  private async write(n: number, existed: boolean) {
    if (existed) this.ctx.storage.sql.exec("UPDATE c SET n = ?", n);
    else {
      this.ctx.storage.sql.exec("INSERT INTO c (n) VALUES (?)", n);
      await this.ctx.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1000);
    }
  }

  async hit(limit: number): Promise<{ allowed: boolean; remaining: number }> {
    const n = this.count();
    const used = n ?? 0;
    if (used >= limit) return { allowed: false, remaining: 0 };
    await this.write(used + 1, n !== null);
    return { allowed: true, remaining: limit - used - 1 };
  }

  async peek(limit: number): Promise<number> {
    return Math.max(0, limit - (this.count() ?? 0));
  }

  async markExhausted(): Promise<void> {
    const n = this.count();
    await this.write(1, n !== null);
  }

  async exhausted(): Promise<boolean> {
    return (this.count() ?? 0) > 0;
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
