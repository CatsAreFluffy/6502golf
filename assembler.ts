import { Operand, Line, Program, Expr } from "./parser";

type Relocation = {
    address: number,
    instruction_address: number,
    length: number,
    expr: Expr,
}

export default function assemble(program: Program): number[] {
    let ret = new Array(65536).fill(0);
    let relocations: Relocation[] = [];
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
        ret[org] = opcode;
        org = (org + 1) & 0xffff;
        let operand_length = operand_lengths.get(operand.mode);
        if(!operand_length) {
            throw new Error(`Unknown length for addressing mode ${operand.mode}`);
        }
        relocations.push({
            address: org,
            instruction_address: (org - 1) & 0xffff,
            length: operand_length,
            expr: operand.body,
        })
        org = (org + operand_length) & 0xffff;
    }
    for(let {address, instruction_address, length, expr} of relocations) {
        let value = expr;
        if(typeof expr == "string") {
            value = 0x205;
        } else {
            value = expr;
        }
        for(let i = 0; i < length; i++) {
            ret[(address + i) & 0xffff] = value & 255;
            value >>= 8;
        }
    }
    return ret;
}