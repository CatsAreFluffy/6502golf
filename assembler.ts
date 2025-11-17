import { Operand, Command, Program, Expr } from "./parser";
import { AssembleInstruction, ParseAddressingMode, AssembleAddressingMode, encodings } from "./instructions";

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

export default function assemble(program: Program): number[] {
    let ret = new Array(65536).fill(0);
    let relocations: Relocation[] = [];
    let labels: Map<string, number> = new Map();
    // reset=0x200
    ret[0xfffd] = 2;
    let org = 0x200;
    const branch_instructions = new Set(["bcc", "bcs", "bne", "bpl"]);
    const operand_lengths = new Map([
        ["absolute", 2],
        ["absolute,x", 2],
        ["absolute,y", 2],
        ["indirect", 2],
        ["indirect,x", 1],
        ["indirect,y", 1],
        ["immediate", 1],
        ["implicit", 0],
        ["relative", 1],
        ["zeropage", 1],
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
                let mode: AssembleAddressingMode = operand.mode;
                if(branch_instructions.has(instruction)) {
                    mode = "relative";
                }
                if(instruction.length == 4 && instruction[3] == "z") {
                    switch(mode) {
                        case "absolute":
                            mode = "zeropage";
                            break;
                        case "absolute,x":
                            mode = "zeropage,x";
                            break;
                        case "absolute,y":
                            mode = "zeropage,y";
                            break;
                        default:
                            throw Error(`Illegal addressing mode ${mode} for ${instruction}`);
                    }
                    instruction = instruction.slice(0, 3);
                }
                let modes = encodings.get(instruction as AssembleInstruction);
                if(modes === undefined) {
                    throw new Error(`Unknown instruction ${instruction}`);
                }
                let opcode = modes.get(mode);
                if(opcode === undefined) {
                    throw new Error(`Illegal addressing mode ${mode} for ${instruction}`);
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