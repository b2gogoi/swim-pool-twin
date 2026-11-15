import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, RefreshCw, Search } from 'lucide-react';
import { db } from '../db/poolDatabase';

type DatabaseRecord = Record<string, unknown>;

function describeRecord(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, entry: unknown) => {
      if (entry instanceof Blob) {
        return {
          type: 'Blob',
          mimeType: entry.type || 'application/octet-stream',
          size: entry.size,
        };
      }
      if (entry instanceof ArrayBuffer) {
        return { type: 'ArrayBuffer', byteLength: entry.byteLength };
      }
      return entry;
    },
    2
  ) ?? String(value);
}

export const DatabasePage: React.FC = () => {
  const [tableNames, setTableNames] = useState<string[]>([]);
  const [activeTable, setActiveTable] = useState('photos');
  const [records, setRecords] = useState<DatabaseRecord[]>([]);
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const tables = db.tables;
      const names = tables.map((table) => table.name);
      const counts = await Promise.all(tables.map((table) => table.count()));
      const nextCounts = Object.fromEntries(names.map((name, index) => [name, counts[index]]));
      const nextActiveTable = names.includes(activeTable) ? activeTable : names[0];
      const nextRecords = nextActiveTable ? await db.table(nextActiveTable).toArray() : [];

      setTableNames(names);
      setTableCounts(nextCounts);
      setActiveTable(nextActiveTable || '');
      setRecords(nextRecords as DatabaseRecord[]);
      setLastRefreshed(new Date());
    } catch (error) {
      console.error('Unable to read the local database:', error);
      setErrorMessage('Could not read the local IndexedDB database.');
    } finally {
      setIsLoading(false);
    }
  }, [activeTable]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let isCurrent = true;
    const loadRecords = async () => {
      if (!activeTable) return;
      try {
        const nextRecords = await db.table(activeTable).toArray();
        if (isCurrent) setRecords(nextRecords as DatabaseRecord[]);
      } catch (error) {
        console.error(`Unable to read the ${activeTable} table:`, error);
        if (isCurrent) setErrorMessage(`Could not read the ${activeTable} table.`);
      }
    };
    loadRecords();
    return () => {
      isCurrent = false;
    };
  }, [activeTable]);

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) => describeRecord(record).toLowerCase().includes(query));
  }, [records, search]);

  return (
    <main className="database-page" aria-label="IndexedDB viewer">
      <header className="database-page-heading">
        <div className="gallery-icon"><Database size={20} /></div>
        <div className="database-title-group">
          <p className="eyebrow">LOCAL STORAGE</p>
          <h1>IndexedDB</h1>
          <p className="database-name">SwimPoolTwinDB · this browser profile</p>
        </div>
        <button className="database-refresh" onClick={refresh} disabled={isLoading}>
          <RefreshCw size={15} className={isLoading ? 'refresh-spinning' : ''} />
          <span>{isLoading ? 'Refreshing' : 'Refresh'}</span>
        </button>
      </header>

      <div className="database-summary">
        <span><strong>{tableNames.length}</strong> tables</span>
        <span><strong>{Object.values(tableCounts).reduce((sum, count) => sum + count, 0)}</strong> records</span>
        {lastRefreshed && <span>Updated {lastRefreshed.toLocaleTimeString()}</span>}
      </div>

      <div className="database-browser">
        <aside className="database-tables" aria-label="Database tables">
          <p className="database-section-label">TABLES</p>
          {tableNames.map((name) => (
            <button
              key={name}
              className={`database-table-button${activeTable === name ? ' active' : ''}`}
              onClick={() => setActiveTable(name)}
            >
              <span>{name}</span>
              <span className="database-table-count">{tableCounts[name] ?? 0}</span>
            </button>
          ))}
          {tableNames.length === 0 && !isLoading && <p className="database-hint">No tables found.</p>}
        </aside>

        <section className="database-records" aria-label={`${activeTable || 'Database'} records`}>
          <div className="database-records-header">
            <div>
              <h2>{activeTable || 'Records'}</h2>
              <p>{tableCounts[activeTable] ?? 0} total records</p>
            </div>
            <label className="database-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter records"
                aria-label="Filter database records"
              />
            </label>
          </div>

          {errorMessage ? (
            <div className="database-empty">{errorMessage}</div>
          ) : isLoading ? (
            <div className="database-empty">Reading local records…</div>
          ) : visibleRecords.length === 0 ? (
            <div className="database-empty">
              {records.length === 0 ? `No records in ${activeTable}.` : 'No records match this filter.'}
            </div>
          ) : (
            <div className="database-record-list">
              {visibleRecords.map((record, index) => {
                const key = Object.values(record).find((value) => typeof value === 'string') || `Record ${index + 1}`;
                const summary = Object.entries(record)
                  .filter(([, value]) => !(value instanceof Blob))
                  .slice(0, 4)
                  .map(([field, value]) => `${field}: ${typeof value === 'object' ? '[…]' : String(value)}`)
                  .join('  ·  ');
                const blob = record.blob instanceof Blob ? record.blob : null;
                return (
                  <details className="database-record" key={`${String(key)}-${index}`}>
                    <summary>
                      <span className="record-summary-main">
                        <strong>{String(key)}</strong>
                        <span>{summary}</span>
                      </span>
                      {blob && <span className="blob-badge">{blob.type || 'Blob'} · {formatBytes(blob.size)}</span>}
                    </summary>
                    <pre>{describeRecord(record)}</pre>
                  </details>
                );
              })}
            </div>
          )}
        </section>
      </div>
      <p className="database-footnote">This viewer reads IndexedDB for the current site in this browser. Other sites or browser profiles have separate databases.</p>
    </main>
  );
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
