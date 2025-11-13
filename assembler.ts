import { Operand, Command, Program, Expr, AddressingMode as ParseAddressingMode } from "./parser";

type Relocation = {
    address: number,
    instruction_address: number,
    length: number,
    expr: Expr,
    relative: boolean,
}

type AddressingMode = ParseAddressingMode | "relative";
export default function assemble(program: Program): number[] {
    let ret = new Array(65536).fill(0);
    let relocations: Relocation[] = [];
    let labels: Map<string, number> = new Map();
    // reset=0x200
    ret[0xfffd] = 2;
    let org = 0x200;
    const instructions = new Map([
        ["adc", new Map([
            ["absolute", 0x6d],
            ["immediate", 0x69],
        ])],
        ["asl", new Map([
            ["implicit", 0x0a],
        ])],
        ["bne", new Map([
            ["absolute", 0xd0],
        ])],
        ["clc", new Map([
            ["implicit", 0x18],
        ])],
        ["dex", new Map([
            ["implicit", 0xca],
        ])],
        ["inx", new Map([
            ["implicit", 0xe8],
        ])],
        ["lda", new Map([
            ["absolute", 0xad],
            ["immediate", 0xa9],
        ])],
        ["ldx", new Map([
            ["immediate", 0xa2],
        ])],
        ["rol", new Map([
            ["implicit", 0x2a],
            ["absolute", 0x2e],
        ])],
        ["sec", new Map([
            ["implicit", 0x38],
        ])],
        ["sta", new Map([
            ["absolute", 0x8d],
            ["absolute,x", 0x9d],
        ])],
        ["stx", new Map([
            ["absolute", 0x8e],
        ])],
        ["txa", new Map([
            ["implicit", 0x8a],
        ])]
    ]);
    const branch_instructions = new Set(["bne"]);
    const operand_lengths = new Map([
        ["absolute", 2],
        ["absolute,x", 2],
        ["immediate", 1],
        ["implicit", 0],
        ["relative", 1],
    ])
    for(let command of program) {
        switch(command.type) {
            case "dc": {
                relocations.push({
                    address: org,
                    instruction_address: org,
                    length: command.length,
                    expr: command.value,
                    relative: false,
                })
                org = (org + command.length) & 0xffff;
                break;
            }
            case "instruction": {
                let [instruction, operand] = command.body;
                let modes = instructions.get(instruction);
                if(!modes) {
                    throw new Error(`Unknown opcode ${instruction}`);
                }
                let opcode = modes.get(operand.mode);
                if(!opcode) {
                    throw new Error(`Illegal addressing mode ${operand.mode} for ${instruction}`);
                }
                let mode: AddressingMode = operand.mode;
                if(branch_instructions.has(instruction)) {
                    mode = "relative";
                }
                ret[org] = opcode;
                org = (org + 1) & 0xffff;
                let operand_length = operand_lengths.get(mode);
                if(operand_length === undefined) {
                    throw new Error(`Unknown length for addressing mode ${mode}`);
                }
                relocations.push({
                    address: org,
                    instruction_address: (org + operand_length) & 0xffff,
                    length: operand_length,
                    expr: operand.body,
                    relative: mode == "relative",
                })
                org = (org + operand_length) & 0xffff;
                break;
            }
            case "label":
                labels.set(command.body, org);
                break;
            case "org":
                if(typeof command.base == "string") {
                    console.log(command);
                    throw new Error("`org` base must be a constant");
                }
                org = command.base & 0xffff;
                break;
        }
    }
    for(let {address, instruction_address, length, expr, relative} of relocations) {
        let value = expr;
        if(typeof expr == "string") {
            let value2 = labels.get(expr);
            if(value2 === undefined) {
                throw new Error(`Unknown label ${expr}`);
            }
            value = value2;
        } else {
            value = expr;
        }
        if(relative) {
            value = (value - instruction_address) & 0xffff;
        }
        for(let i = 0; i < length; i++) {
            ret[(address + i) & 0xffff] = value & 0xff;
            value >>= 8;
        }
    }
    return ret;
}