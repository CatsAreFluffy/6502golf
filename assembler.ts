import { Operand, Command, Program, Expr, AddressingMode as ParseAddressingMode } from "./parser";

type Relocation = {
    address: number,
    instruction_address: number,
    length: number,
    expr: Expr,
    relative: boolean,
}

function eval_expr(expr: Expr, labels: Map<string, number>): number {
    switch(expr.type) {
        case "binop":
            let left = eval_expr(expr.left, labels);
            let right = eval_expr(expr.right, labels);
            switch(expr.operation) {
                case "+":
                    return (left + right) | 0;
                case "-":
                    return (left - right) | 0;
                case "*":
                    let top = (left * (right & 0xffff0000)) | 0;
                    let bottom = (left * (right & 0xffff)) | 0;
                    return (top + bottom) | 0;
                case "/":
                    throw new Error("/ is unimplemented");
                case "%":
                    throw new Error("/ is unimplemented");
                case "<<":
                    return left << right;
                case ">>":
                    return left >> right;
                case "&":
                    return left & right;
                case "|":
                    return left | right;
                case "^":
                    return left ^ right;
            }
        case "op":
            let body = eval_expr(expr.body, labels);
            switch(expr.operation) {
                case "-":
                    return -body | 0;
                case "~":
                    return ~body;
                case "<":
                    return body & 0xff;
                case ">":
                    return (body >> 8) & 0xff;
            }
        case "label":
            let value = labels.get(expr.label);
            if(value === undefined) {
                throw new Error(`Unknown label ${expr.label}`);
            }
            return value;
        case "constant":
            return expr.value;
    }
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
            ["absolute", 0x0e],
            ["implicit", 0x0a],
        ])],
        ["bcc", new Map([
            ["absolute", 0x90],
        ])],
        ["bcs", new Map([
            ["absolute", 0xb0],
        ])],
        ["bne", new Map([
            ["absolute", 0xd0],
        ])],
        ["bpl", new Map([
            ["absolute", 0x10],
        ])],
        ["brk", new Map([
            ["implicit", 0x00],
        ])],
        ["clc", new Map([
            ["implicit", 0x18],
        ])],
        ["dex", new Map([
            ["implicit", 0xca],
        ])],
        ["dey", new Map([
            ["implicit", 0x88],
        ])],
        ["inx", new Map([
            ["implicit", 0xe8],
        ])],
        ["iny", new Map([
            ["implicit", 0xc8],
        ])],
        ["lda", new Map([
            ["absolute", 0xad],
            ["immediate", 0xa9],
            ["absolute,x", 0xbd],
        ])],
        ["ldx", new Map([
            ["immediate", 0xa2],
            ["absolute", 0xae],
            ["absolute,y", 0xbe],
        ])],
        ["ldy", new Map([
            ["immediate", 0xa0],
            ["absolute", 0xac],
        ])],
        ["rol", new Map([
            ["implicit", 0x2a],
            ["absolute", 0x2e],
            ["absolute,x", 0x3e],
        ])],
        ["sbc", new Map([
            ["absolute", 0xed],
        ])],
        ["sec", new Map([
            ["implicit", 0x38],
        ])],
        ["sta", new Map([
            ["absolute", 0x8d],
            ["absolute,x", 0x9d],
            ["absolute,y", 0x99],
        ])],
        ["stx", new Map([
            ["absolute", 0x8e],
        ])],
        ["sty", new Map([
            ["absolute", 0x8c],
        ])],
        ["tax", new Map([
            ["implicit", 0xaa],
        ])],
        ["tay", new Map([
            ["implicit", 0xa8],
        ])],
        ["txa", new Map([
            ["implicit", 0x8a],
        ])],
        ["tya", new Map([
            ["implicit", 0x98],
        ])],
    ]);
    const branch_instructions = new Set(["bcc", "bcs", "bne", "bpl"]);
    const operand_lengths = new Map([
        ["absolute", 2],
        ["absolute,x", 2],
        ["absolute,y", 2],
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
                if(modes === undefined) {
                    throw new Error(`Unknown opcode ${instruction}`);
                }
                let opcode = modes.get(operand.mode);
                if(opcode === undefined) {
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
                org = eval_expr(command.base, new Map());
                break;
        }
    }
    for(let {address, instruction_address, length, expr, relative} of relocations) {
        let value = eval_expr(expr, labels);
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