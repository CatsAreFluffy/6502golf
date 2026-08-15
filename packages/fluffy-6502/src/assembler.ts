import { LocatedError, lex, parse } from "./parser.js";
import type { Program, Expr } from "./parser.js";
import { encodings } from "./instructions.js";
import type { AssembleInstruction, AssembleAddressingMode } from "./instructions.js";

type Relocation = {
    address: number,
    instruction_address: number,
    length: number,
    expr: Expr,
    relative: boolean,
};

function eval_expr(expr: Expr, labels: Map<string, Expr>, instruction_address: number, depth: number): number {
    if(depth > labels.size) {
        throw new LocatedError("Self-referential expression", expr.start, expr.end);
    }
    switch(expr.type) {
        case "binop": {
            const left = eval_expr(expr.left, labels, instruction_address, depth);
            const right = eval_expr(expr.right, labels, instruction_address, depth);
            switch(expr.operation) {
                case "+":
                    return (left + right) | 0;
                case "-":
                    return (left - right) | 0;
                case "*": {
                    const top = (left * (right & 0xffff0000)) | 0;
                    const bottom = (left * (right & 0xffff)) | 0;
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
            break;
        }
        case "op": {
            const body = eval_expr(expr.body, labels, instruction_address, depth);
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
            break;
        }
        case "label": {
            if(expr.label == ".") {
                return instruction_address;
            }
            const subexpr = labels.get(expr.label);
            if(subexpr === undefined) {
                throw new LocatedError(`Unknown label ${expr.label}`, expr.start, expr.end);
            }
            return eval_expr(subexpr, labels, instruction_address, depth + 1);
        }
        case "constant":
            return expr.value;
    }
}

function assemble_program(program: Program): {memory: number[], sources: Map<number, [number, number]>, line_targets: Map<number, [number]>} {
    const ret = new Array(65536).fill(0);
    const sources = new Map();
    const line_targets = new Map();
    function write_byte(address: number, value: number | undefined, command_start: number, command_end: number, command_line: number) {
        if(value !== undefined) {
            ret[address] = value;
        }
        sources.set(address, [command_start, command_end]);
        if(!line_targets.has(command_line)) {
            line_targets.set(command_line, [address]);
        } else {
            line_targets.get(command_line).push(address);
        }
    }
    const relocations: Relocation[] = [];
    const labels: Map<string, Expr> = new Map();
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
    ]);
    for(const command of program) {
        switch(command.type) {
            case "dc":
                relocations.push({
                    address: org,
                    instruction_address: org,
                    length: command.length,
                    expr: command.value,
                    relative: false,
                });
                for(let i = 0; i < command.length; i++) {
                    write_byte((org + i) & 0xffff, undefined, command.start, command.end, command.start_line);
                }
                org = (org + command.length) & 0xffff;
                break;
            case "dcstring": {
                const {length, value} = command;
                for(let i = 0; i < value.value.length;) {
                    const char_len = 1 + +(value.value[i]=="\\");
                    const char_start = value.start + 1 + i;
                    const char_end = char_start + char_len;
                    let char = value.value[i];
                    if(value.value[i]=="\\") {
                        switch(value.value[i+1]) {
                            case "n":
                                char = "\n";
                                break;
                            case "r":
                                char = "\r";
                                break;
                            case "t":
                                char = "\t";
                                break;
                            case "\\":
                                char = "\\";
                                break;
                            default:
                                char = String.fromCharCode(0);
                                break;
                        }
                    }
                    const ord = char!.charCodeAt(0);
                    if(length == 1 && ord > 128) {
                        throw new LocatedError("Multibyte character in byte string", char_start, char_end);
                    }
                    write_byte(org, ord & 0xff, char_start, char_end, command.start_line);
                    org = (org + 1) & 0xffff;
                    if(length == 2) {
                        write_byte(org, ord >> 8, char_start, char_end, command.start_line);
                        org = (org + 1) & 0xffff;
                    }
                    i += char_len;
                }
                break;
            }
            case "ds": {
                const length = eval_expr(command.length, new Map(), org, 0) * command.entry_size;
                for(let i = 0; i < length; i++) {
                    write_byte((org + i) & 0xffff, undefined, command.start, command.end, command.start_line);
                }
                org = (org + length) & 0xffff;
                break;
            }
            case "equ": {
                labels.set(command.label!.name, command.value);
                break;
            }
            case "instruction": {
                // eslint-disable-next-line prefer-const
                let {instruction, operand, start, end} = command.body;
                let mode: AssembleAddressingMode = operand.mode;
                if(branch_instructions.has(instruction)) {
                    if(mode != "absolute") {
                        throw new LocatedError(`Illegal addressing mode ${mode} for ${instruction}`, start, end);
                    }
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
                const modes = encodings.get(instruction as AssembleInstruction);
                if(modes === undefined) {
                    throw new LocatedError(`Unknown instruction ${instruction}`, start, start + command.body.instruction.length);
                }
                const opcode = modes.get(mode);
                if(opcode === undefined) {
                    throw new LocatedError(`Illegal addressing mode ${mode} for ${instruction}`, start, end);
                }
                write_byte(org, opcode, command.start, command.start + command.body.instruction.length, command.start_line);
                org = (org + 1) & 0xffff;
                const operand_length = operand_lengths.get(mode);
                if(operand_length === undefined) {
                    throw new LocatedError(`Unknown length for addressing mode ${mode}`, start, end);
                }
                relocations.push({
                    address: org,
                    instruction_address: (org + operand_length) & 0xffff,
                    length: operand_length,
                    expr: operand.body,
                    relative: mode == "relative",
                });
                for(let i = 0; i < operand_length; i++) {
                    write_byte((org + i) & 0xffff, undefined, command.body.operand.start, command.end, command.start_line);
                }
                org = (org + operand_length) & 0xffff;
                break;
            }
            case "label":
                labels.set(command.body.name, {type: "constant", value: org, start: 0, end: 0, start_line: 0, end_line: 0});
                break;
            case "org":
                org = eval_expr(command.base, new Map(), org, 0);
                break;
        }
    }
    for(const {address, instruction_address, length, expr, relative} of relocations) {
        let value = eval_expr(expr, labels, org, 0);
        if(relative) {
            value = (value - instruction_address) & 0xffff;
            if(value < 0xff80 && value >= 128) {
                const value2 = value >= 0x8000 ? value - 0x10000 : value;
                throw new LocatedError(`Branch target too far (offset ${value2})`, expr.start, expr.end);
            }
        } else if(length < 2 && (value < -256 || value >= 256)) {
            throw new LocatedError(`Value too large (${value})`, expr.start, expr.end);
        }
        for(let i = 0; i < length; i++) {
            ret[(address + i) & 0xffff] = value & 0xff;
            value >>= 8;
        }
    }
    return {memory: ret, sources, line_targets};
}

export function assemble(input: string): {memory: number[], sources: Map<number, [number, number]>, line_targets: Map<number, number[]>} {
    const tokens = lex(input);
    const parse_tree = parse(tokens);
    return assemble_program(parse_tree);
}