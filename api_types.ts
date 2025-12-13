export type SubmitRequest = {
    challenge_name: string,
    memory: any,
};

export type SubmitResponse = {
    pass: boolean,
    message: string,
};