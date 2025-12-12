import { Operand, Command, Program, Expr, LocatedError } from "./parser";
import { AssembleInstruction, ParseAddressingMode, AssembleAddressingMode, encodings } from "./instructions";

type Relocation = {
    address: number,
    instruction_address: number,
    length: number,
    expr: Expr,
    relative: boolean,
}

function eval_expr(expr: Expr, labels: Map<string, Expr>, depth: number = 0): number {
    if(depth > labels.size) {
        throw new LocatedError("Self-referential expression", expr.start, expr.end);
    }
    switch(expr.type) {
        case "binop": {
            let left = eval_expr(expr.left, labels, depth);
            let right = eval_expr(expr.right, labels, depth);
            switch(expr.operation) {
                case "+":
                    return (left + right) | 0;
                case "-":
                    return (left - right) | 0;
                case "*": {
                    let top = (left * (right & 0xffff0000)) | 0;
                    let bottom = (left * (right & 0xffff)) | 0;
                    return (top + bottom) | 0;
                }
                case "/":
                case "%": {
                    if(right == 0) {
                        return 0;
                    }
                    const quot = (left / right) | 0;
                    if(expr.operation == "/") {
                        return quot;
                    } else {
                        return left - quot * right | 0;
                    }
                }
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
        }
        case "op": {
            let body = eval_expr(expr.body, labels, depth);
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
        }
        case "label": {
            let subexpr = labels.get(expr.label);
            if(subexpr === undefined) {
                throw new LocatedError(`Unknown label ${expr.label}`, expr.start, expr.end);
            }
            return eval_expr(subexpr, labels, depth + 1);
        }
        case "constant":
            return expr.value;
    }
}

export default function assemble(program: Program): number[] {
    let ret = new Array(65536).fill(0);
    let relocations: Relocation[] = [];
    let labels: Map<string, Expr> = new Map();
    // reset=0x200
    ret[0xfffd] = 2;
    let org = 0x200;
    const branch_instructions = new Set(["bcc", "bcs", "beq", "bmi", "bne", "bpl", "bvc", "bvs"]);
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
        ["zeropage,x", 1],
        ["zeropage,y", 1],
    ])
    for(let command of program) {
        switch(command.type) {
            case "dc":
                relocations.push({
                    address: org,
                    instruction_address: org,
                    length: command.length,
                    expr: command.value,
                    relative: false,
                })
                org = (org + command.length) & 0xffff;
                break;
            case "equ": {
                labels.set(command.label!, command.value);
                break;
            }
            case "instruction": {
                let {instruction, operand, start, end} = command.body;
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
                            throw new LocatedError(`Illegal addressing mode ${mode} for ${instruction}`, start, end);
                    }
                    instruction = instruction.slice(0, 3);
                }
                let modes = encodings.get(instruction as AssembleInstruction);
                if(modes === undefined) {
                    throw new LocatedError(`Unknown instruction ${instruction}`, start, start + command.body.instruction.length);
                }
                let opcode = modes.get(mode);
                if(opcode === undefined) {
                    throw new LocatedError(`Illegal addressing mode ${mode} for ${instruction}`, start, end);
                }
                ret[org] = opcode;
                org = (org + 1) & 0xffff;
                let operand_length = operand_lengths.get(mode);
                if(operand_length === undefined) {
                    throw new LocatedError(`Unknown length for addressing mode ${mode}`, start, end);
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
                labels.set(command.body, {type: "constant", value: org, start: 0, end: 0});
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
            if(value < 0xff80 && value >= 128) {
                console.log(value);
                throw new LocatedError("Branch target too far", expr.start, expr.end);
            }
        } else if(length < 2 && (value < -256 || value >= 256)) {
            throw new LocatedError("Value too large", expr.start, expr.end);
        }
        for(let i = 0; i < length; i++) {
            ret[(address + i) & 0xffff] = value & 0xff;
            value >>= 8;
        }
    }
    return ret;
}