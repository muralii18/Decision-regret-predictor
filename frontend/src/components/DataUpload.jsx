import { useRef, useState } from 'react'
import {
  EXPECTED_COLUMNS,
  MAX_FILE_BYTES,
  VALID_CATEGORIES,
  VALID_CONFIDENCE_LEVELS,
  VALID_OBSERVATION_WINDOWS,
  validateHistoricalCsvText,
} from '../lib/historicalCsv'
import './DataUpload.css'

const PREVIEW_LIMIT = 10

function StatCard({ label, value, tone }) {
  return (
    <article className={`upload-stat upload-stat--${tone}`}>
      <p className="upload-stat__value">{value}</p>
      <p className="upload-stat__label">{label}</p>
    </article>
  )
}

function RowOutcome({ row }) {
  if (!row.valid) return <span className="badge badge--danger">Invalid</span>
  if (row.unknownOutcome) return <span className="badge badge--warning">Unknown outcome</span>
  return <span className="badge badge--success">Valid</span>
}

function DataUpload() {
  const [fileName, setFileName] = useState(null)
  const [result, setResult] = useState(null) // validation result or null
  const [readError, setReadError] = useState(null)
  const [isReading, setIsReading] = useState(false)
  const inputRef = useRef(null)

  function reset() {
    setFileName(null)
    setResult(null)
    setReadError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    reset()
    setFileName(file.name)

    if (file.size > MAX_FILE_BYTES) {
      setReadError(`File is too large (${(file.size / 1024).toFixed(0)} KB). The maximum size for in-browser validation is ${MAX_FILE_BYTES / (1024 * 1024)} MB.`)
      return
    }

    setIsReading(true)
    // The file is read locally in the browser only. It is never uploaded.
    file
      .text()
      .then((text) => setResult(validateHistoricalCsvText(text)))
      .catch(() => setReadError('The file could not be read. It may be corrupted or not a text file.'))
      .finally(() => setIsReading(false))
  }

  const stats = result?.stats
  const hasFileErrors = Boolean(result?.fileErrors.length)
  const previewRows = result?.rows.slice(0, PREVIEW_LIMIT) ?? []
  const errorRows = result?.rows.filter((row) => row.errors.length > 0) ?? []

  return (
    <>
      <div className="page-header">
        <div className="page-header__text">
          <h1>Historical Data Upload</h1>
          <p>
            Validate a historical decision CSV against the ML dataset schema and preview its
            records before training data is assembled.
          </p>
        </div>
      </div>

      <section className="panel upload-panel">
        <div className="panel__header">
          <div>
            <h3 className="panel__title">Select a CSV file</h3>
            <p className="panel__subtitle">CSV only (UTF-8, comma-separated, with a header row).</p>
          </div>
        </div>

        <div className="upload-picker">
          <label className="upload-picker__label" htmlFor="historical-csv-input">
            Choose CSV file
          </label>
          <input
            ref={inputRef}
            id="historical-csv-input"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
          />
          {fileName && (
            <button type="button" className="btn btn--secondary" onClick={reset}>
              Clear file
            </button>
          )}
        </div>

        <div className="upload-format-note" role="note">
          <p className="upload-format-note__title">Expected format</p>
          <p>
            Header row with exactly these {EXPECTED_COLUMNS.length} columns:{' '}
            <code>{EXPECTED_COLUMNS.join(', ')}</code>.
          </p>
          <ul>
            <li>
              <strong>category</strong>: one of {VALID_CATEGORIES.join(', ')}
            </li>
            <li>
              <strong>confidence_level</strong>: one of {VALID_CONFIDENCE_LEVELS.join(', ')}
            </li>
            <li>
              <strong>observation_window_days</strong>: {VALID_OBSERVATION_WINDOWS.join(' or ')}
            </li>
            <li>
              <strong>target_reversed</strong>: 1 = reversed within the window, 0 = not reversed
              within it, empty = outcome unknown (kept as unknown, never converted to 0)
            </li>
            <li>
              <strong>decision_date</strong>: ISO date (YYYY-MM-DD), not in the future
            </li>
          </ul>
        </div>

        <p className="upload-privacy-note" role="note">
          This page validates the file entirely in your browser — nothing is uploaded to a server,
          saved to PostgreSQL, or used to train a model. It is a validation and preview step only;
          permanent storage and model training will be added in later steps.
        </p>
      </section>

      {isReading && (
        <section className="panel upload-status" role="status">
          <p>Reading file&hellip;</p>
        </section>
      )}

      {readError && (
        <section className="panel upload-status upload-status--error" role="alert">
          <h3 className="upload-status__title">The file could not be validated</h3>
          <p>{readError}</p>
        </section>
      )}

      {result && !isReading && (
        <>
          {hasFileErrors && (
            <section className="panel upload-status upload-status--error" role="alert">
              <h3 className="upload-status__title">File-level problems</h3>
              <ul className="upload-error-list">
                {result.fileErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
              <p className="upload-status__hint">
                Fix these problems in the CSV and select the file again. Row-level checks cannot run
                until the schema matches.
              </p>
            </section>
          )}

          {!hasFileErrors && (
            <>
              <section className="upload-stats" aria-label="Validation summary">
                <StatCard label="Total rows" value={stats.totalRows} tone="indigo" />
                <StatCard label="Valid rows" value={stats.validRows} tone="success" />
                <StatCard label="Invalid rows" value={stats.invalidRows} tone={stats.invalidRows > 0 ? 'danger' : 'muted'} />
                <StatCard
                  label="Unknown outcome (excluded from training)"
                  value={stats.unknownOutcomeRows}
                  tone="warning"
                />
              </section>

              <p className="upload-summary-note">
                File: <strong>{fileName}</strong> — {stats.labeledRows} row
                {stats.labeledRows === 1 ? '' : 's'} carry a known outcome label (0 or 1) and are
                suitable for supervised training; {stats.unknownOutcomeRows} row
                {stats.unknownOutcomeRows === 1 ? '' : 's'} have an unknown outcome (empty{' '}
                <code>target_reversed</code>) and will be excluded from training — unknown never
                counts as 0.
              </p>

              {previewRows.length > 0 && (
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <h3 className="panel__title">Record preview</h3>
                      <p className="panel__subtitle">
                        First {previewRows.length} of {stats.totalRows} rows, exactly as uploaded
                        (values are never modified).
                      </p>
                    </div>
                  </div>

                  <div className="table-wrap">
                    <table className="decisions-table upload-preview">
                      <caption className="visually-hidden">
                        Preview of uploaded historical decision records with validation status
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Row</th>
                          <th scope="col">Decision ID</th>
                          <th scope="col">Date</th>
                          <th scope="col">Category</th>
                          <th scope="col">Cost (USD)</th>
                          <th scope="col">Alts.</th>
                          <th scope="col">Confidence</th>
                          <th scope="col">Window (days)</th>
                          <th scope="col">Target</th>
                          <th scope="col">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row) => (
                          <tr key={row.rowNumber}>
                            <td className="upload-preview__rownum">{row.rowNumber}</td>
                            <td className="cell-name">{row.record.decision_id || '—'}</td>
                            <td className="cell-date">{row.record.decision_date || '—'}</td>
                            <td>
                              <span className="category-tag">{row.record.category || '—'}</span>
                            </td>
                            <td>{row.record.estimated_cost_usd || '—'}</td>
                            <td>{row.record.num_alternatives || '—'}</td>
                            <td>{row.record.confidence_level || '—'}</td>
                            <td>{row.record.observation_window_days || '—'}</td>
                            <td>
                              {row.record.target_reversed === '' ? (
                                <em className="upload-preview__unknown">empty</em>
                              ) : (
                                row.record.target_reversed
                              )}
                            </td>
                            <td>
                              <RowOutcome row={row} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {stats.totalRows > PREVIEW_LIMIT && (
                    <p className="panel__footer-note">
                      Preview limited to the first {PREVIEW_LIMIT} rows. All {stats.totalRows} rows
                      were validated.
                    </p>
                  )}
                </section>
              )}

              {errorRows.length > 0 && (
                <section className="panel upload-errors">
                  <div className="panel__header">
                    <div>
                      <h3 className="panel__title">
                        Row-level problems ({errorRows.length} row
                        {errorRows.length === 1 ? '' : 's'})
                      </h3>
                      <p className="panel__subtitle">
                        Row numbers are data rows (the header row is not counted).
                      </p>
                    </div>
                  </div>
                  <ul className="upload-error-list">
                    {errorRows.map((row) => (
                      <li key={row.rowNumber}>
                        <strong>Row {row.rowNumber}:</strong>{' '}
                        {row.errors.join(' ')}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {errorRows.length === 0 && stats.totalRows > 0 && (
                <section className="panel upload-status upload-status--ok" role="status">
                  <p>
                    All {stats.totalRows} rows passed schema validation. The file is ready for the
                    next step once backend storage is implemented.
                  </p>
                </section>
              )}
            </>
          )}
        </>
      )}
    </>
  )
}

export default DataUpload
