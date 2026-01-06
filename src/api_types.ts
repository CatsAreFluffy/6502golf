export type SubmitRequest = {
    username: string,
    challenge_name: string,
    memory: Record<number, number[]>,
};

export type SubmitResponse = {
    pass: boolean,
    message: string,
};

export type LeaderboardRequest = {
    challenge_name: string,
} & ({
    scoring: "bytes" | "frontier",
} | {
    scoring: "cycles",
    max_bytes: number,
});

export type LeaderboardRow = {
    bytes: number,
    cycles: number,
    username: string,
};

export type LeaderboardResponse = LeaderboardRow[];