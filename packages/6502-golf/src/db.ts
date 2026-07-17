import postgres from "postgres";

const host = process.env.POSTGRES_HOST || "db";
const database = process.env.POSTGRES_DB || "6502golf";
const user = process.env.POSTGRES_USER || "postgres";
const password = process.env.POSTGRES_PASSWORD || undefined;

if (process.env.NODE_ENV === "production" && !password) {
    throw new Error("POSTGRES_PASSWORD must be set in production environment");
}

const sql = postgres({
    host,
    db: database,
    user,
    password,
});

export default sql;