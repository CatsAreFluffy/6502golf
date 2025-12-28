import postgres from "postgres";

const sql = postgres({
    host: "db",
    db: "6502golf",
    user: "postgres",
});

export default sql;