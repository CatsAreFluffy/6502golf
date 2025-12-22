export type SubmitRequest = {
    challenge_name: string,
    memory: Record<number, number[]>,
};

export type SubmitResponse = {
    pass: boolean,
    message: string,
};