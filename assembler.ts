import { Operand, Line, Program } from "./parser";

export default function assemble(program: Program): number[] {
    let ret = new Array(65536).fill(0);
    // reset=0x200
    ret[0xfffd] = 2;
    let org = 0x200;
    const instructions = new Map([
        ["lda", new Map([
            ["absolute", 0xad],
            ["immediate", 0xa9],
        ])],
        ["sta", new Map([
            ["absolute", 0x8d],
        ])],
    ]);
    const operand_lengths = new Map([
        ["absolute", 2],
        ["immediate", 1],
    ])
    for(let [instruction, operand] of program) {
        let modes = instructions.get(instruction);
        if(!modes) {
            throw new Error(`Unknown opcode ${instruction}`);
        }
        let opcode = modes.get(operand.mode);
        if(!opcode) {
            throw new Error(`Illegal addressing mode ${operand.mode} for ${instruction}`);
        }
        ret[org++] = opcode;
        let operand_length = operand_lengths.get(operand.mode);
        if(!operand_length) {
            throw new Error(`Unknown length for addressing mode ${operand.mode}`);
        }
        if(operand_length > 0) {
            ret[org++] = operand.body & 255;
        }
        if(operand_length > 1) {
            ret[org++] = (operand.body >> 8) & 255;
        }
    }
    return ret;
}