import { HttpError } from "../middleware/errorHandler.js";
import type { Pool } from "pg";

const eventTimestampExpressions = new Map<string, Promise<string>>();

export function requireDateOnly(value: unknown): string {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) ||
        new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
    ) {
        throw new HttpError(400, "valid_date_required");
    }
    return value;
}

export function zonedDayRangeSql(dateParameter: string, timeZoneParameter: string) {
    return {
        start: `(${dateParameter}::date::timestamp AT TIME ZONE ${timeZoneParameter})`,
        end: `(((${dateParameter}::date + 1)::timestamp) AT TIME ZONE ${timeZoneParameter})`,
    };
}

export function eventTimestampInstantSql(
    pool: Pick<Pool, "query">,
    column: "start_datetime" | "end_datetime",
    alias = "e",
): Promise<string> {
    const cacheKey = `${alias}.${column}`;
    let expression = eventTimestampExpressions.get(cacheKey);
    if (!expression) {
        expression = pool.query<{ data_type: string }>(
            `SELECT data_type
             FROM information_schema.columns
             WHERE table_schema = ANY(current_schemas(FALSE))
               AND table_name = 'events'
               AND column_name = $1
             ORDER BY array_position(current_schemas(FALSE), table_schema)
             LIMIT 1`,
            [column],
        ).then((result) => {
            const dataType = result.rows[0]?.data_type;
            if (dataType === "timestamp with time zone") {
                return `${alias}.${column}`;
            }
            if (dataType === "timestamp without time zone") {
                return `(${alias}.${column} AT TIME ZONE 'UTC')`;
            }
            throw new Error(`Unsupported events.${column} database type: ${dataType ?? "column not found"}`);
        });
        eventTimestampExpressions.set(cacheKey, expression);
    }
    return expression;
}
