/**
 * Data access. Every query is parameterized — user input is NEVER
 * concatenated into SQL.
 *
 * Ids are BIGSERIAL: pg returns BIGINT values as strings and they are
 * serialized as strings in JSON (safe for any future id size).
 */

export function createRepo(pool) {
  return {
    async healthCheck() {
      await pool.query('SELECT 1')
    },

    async createDecision(row) {
      // Column names are hard-coded here (never user input); values are always
      // parameterized. decision_date is omitted when absent so the column
      // DEFAULT CURRENT_DATE applies.
      const columns = [
        'title',
        'category',
        'estimated_cost_usd',
        'num_alternatives',
        'confidence_level',
        'business_context',
        'expected_benefits',
        'identified_risks',
      ]
      const values = [
        row.title,
        row.category,
        row.estimated_cost_usd,
        row.num_alternatives,
        row.confidence_level,
        row.business_context,
        row.expected_benefits,
        row.identified_risks,
      ]
      if (row.decision_date !== undefined && row.decision_date !== null) {
        columns.push('decision_date')
        values.push(row.decision_date)
      }
      const placeholders = values.map((_, index) => `$${index + 1}`).join(', ')
      const result = await pool.query(
        `INSERT INTO decisions (${columns.join(', ')})
         VALUES (${placeholders})
         RETURNING *`,
        values,
      )
      return result.rows[0]
    },

    async getDecision(id) {
      const result = await pool.query('SELECT * FROM decisions WHERE id = $1', [id])
      return result.rows[0] ?? null
    },

    /** Newest first (created_at DESC, id DESC), with the current outcome. */
    async listDecisions({ limit, offset }) {
      const result = await pool.query(
        `SELECT d.*,
                o.outcome        AS outcome_value,
                o.outcome_date   AS outcome_date_value,
                o.note           AS outcome_note,
                o.updated_at     AS outcome_updated_at
           FROM decisions d
           LEFT JOIN decision_outcomes o ON o.decision_id = d.id
          ORDER BY d.created_at DESC, d.id DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset],
      )
      const countResult = await pool.query('SELECT count(*)::int AS count FROM decisions')
      return { rows: result.rows, totalCount: countResult.rows[0].count }
    },

    /** Record-or-update: one current outcome row per decision (UNIQUE). */
    async upsertOutcome(decisionId, value) {
      const result = await pool.query(
        `INSERT INTO decision_outcomes (decision_id, outcome, outcome_date, note)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (decision_id) DO UPDATE
           SET outcome = EXCLUDED.outcome,
               outcome_date = EXCLUDED.outcome_date,
               note = EXCLUDED.note,
               updated_at = now()
         RETURNING *`,
        [decisionId, value.outcome, value.outcome_date, value.note],
      )
      return result.rows[0]
    },

    async getOutcome(decisionId) {
      const result = await pool.query(
        'SELECT * FROM decision_outcomes WHERE decision_id = $1',
        [decisionId],
      )
      return result.rows[0] ?? null
    },

    /** Persist a validated genuine ML response (provider_response = the
     * exact JSON FastAPI returned, disclaimer included verbatim). */
    async insertPrediction(decisionId, prediction) {
      const result = await pool.query(
        `INSERT INTO predictions
           (decision_id, probability_of_reversal, probability_percent,
            predicted_class, predicted_label, threshold, dataset, disclaimer,
            provider_response)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          decisionId,
          prediction.probability_of_reversal,
          prediction.probability_percent,
          prediction.predicted_class,
          prediction.predicted_label,
          prediction.threshold,
          prediction.dataset,
          prediction.disclaimer,
          JSON.stringify(prediction.provider_response),
        ],
      )
      return result.rows[0]
    },

    async listPredictions(decisionId) {
      const result = await pool.query(
        'SELECT * FROM predictions WHERE decision_id = $1 ORDER BY created_at DESC, id DESC',
        [decisionId],
      )
      return result.rows
    },
  }
}
