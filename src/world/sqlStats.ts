/**
 * Counts the rows each SQL statement reads. Cloudflare bills a Durable Object's SQLite by rows
 * read (every row a query scans, not just the rows it returns), so this is what to look at when
 * that number climbs. Kept in memory since the object last woke; GET /api/admin/sql-stats shows it.
 */
export interface StatementStats {
  sql: string;
  calls: number;
  rowsRead: number;
  rowsWritten: number;
}

export class SqlStats {
  readonly since = Date.now();
  private byStatement = new Map<string, StatementStats>();
  /** Cursors not yet counted: a cursor's counts grow as it is read, so they're added up later. */
  private pending: { stats: StatementStats; cursor: SqlStorageCursor<Record<string, SqlStorageValue>> }[] = [];

  /** Wrap `sql` so every exec is counted. */
  wrap(sql: SqlStorage): SqlStorage {
    return new Proxy(sql, {
      get: (target, prop) => {
        if (prop !== "exec") {
          const value = Reflect.get(target, prop, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return (query: string, ...bindings: unknown[]) => {
          const cursor = target.exec(query, ...bindings);
          const key = query.replace(/\s+/g, " ").trim();
          let stats = this.byStatement.get(key);
          if (!stats) this.byStatement.set(key, (stats = { sql: key, calls: 0, rowsRead: 0, rowsWritten: 0 }));
          stats.calls++;
          if (this.pending.length > 500) this.settle();
          this.pending.push({ stats, cursor });
          return cursor;
        };
      },
    });
  }

  private settle() {
    for (const { stats, cursor } of this.pending) {
      stats.rowsRead += cursor.rowsRead;
      stats.rowsWritten += cursor.rowsWritten;
    }
    this.pending = [];
  }

  /** The statements that read the most rows, most first. */
  report(limit = 25) {
    this.settle();
    const all = [...this.byStatement.values()];
    const sum = (k: "rowsRead" | "rowsWritten" | "calls") => all.reduce((n, s) => n + s[k], 0);
    return {
      since: new Date(this.since).toISOString(),
      minutes: Math.round((Date.now() - this.since) / 60_000),
      calls: sum("calls"),
      rowsRead: sum("rowsRead"),
      rowsWritten: sum("rowsWritten"),
      top: all.sort((a, b) => b.rowsRead - a.rowsRead).slice(0, limit),
    };
  }
}
