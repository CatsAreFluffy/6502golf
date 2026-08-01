import type { ParseAddressingMode } from "./instructions.ts";

type Token = {
    token: string,
    position: number,
    start_line: number,
    end_line: number,
    kind: "identifier" | "symbol" | "string" | "indent" | "newline" | "eof",
};

export class LocatedError extends Error {
    start: number;
    end: number;

    constructor(message: string, start: number, end: number) {
        super(message);
        this.start = start;
        this.end = end;
    }
}

function lex(input: string): Token[] {
    let position = 0;
    let line = 0;
    let start_of_line = true;
    const ret: Token[] = [];
    const regexp = /([ \t]+|;[^\n]*$|(?:[ \t]*(?:;[^\n]*)?\n)+|[0-9a-zA-Z_.$]+|'(?:[^\n\\']|\\.)'|"(?:[^\n\\"]|\\.)*"|<<|>>|[()[\]+-/*|^&~,#:<>=])/sy;
    regexp.lastIndex = 0;
    while(regexp.lastIndex < input.length) {
        const last_index = regexp.lastIndex;
        const match = regexp.exec(input);
        if(!match) {
            const line_regexp = /.*/y;
            line_regexp.lastIndex = last_index;
            const line_length = line_regexp.exec(input)![0].length;
            throw new LocatedError("Invalid token", position, position + line_length);
        }

        const token = match[1]!;
        const newlines_in_token = token.split("\n").length - 1;
        const start_line = line;
        const end_line = line + newlines_in_token;
        // simplify whitespace tokens
        if(/^\s|;/.exec(token)) {
            if(token.includes("\n")) {
                ret.push({token, position, start_line, end_line, kind: "newline"});
            }
            else if(start_of_line) {
                // single-line whitespace is only significant at the beginning
                ret.push({token, position, start_line, end_line, kind: "indent"});
            }
        } else if(token[0]=='"') {
            ret.push({token, position, start_line, end_line, kind: "string"});
        } else if(/[0-9a-zA-Z_.$']/.exec(token)) {
            ret.push({token, position, start_line, end_line, kind: "identifier"});
        } else {
            ret.push({token, position, start_line, end_line, kind: "symbol"});
        }
        position += token.length;
        line += newlines_in_token;
        start_of_line = token.match(/\n *$/) !== null;
    }
    ret.push({token: "", position, start_line: line, end_line: line, kind: "eof"});
    return ret;
}

class TokenStream {
    tokens: Token[];
    index: number;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
        this.index = 0;
    }

    position(): number {
        return this.tokens[this.index]!.position;
    }

    peek(): Token {
        if(!this.eof()) {
            return this.tokens[this.index]!;
        }
        throw new ParseError("Unexpected end of file", this.tokens.at(-1)!);
    }

    line(): number {
        return this.tokens[this.index]!.start_line;
    }

    next(): Token {
        const token = this.peek();
        this.index++;
        return token;
    }

    eof(): boolean {
        return this.index == this.tokens.length - 1;
    }
}

export class ParseError extends LocatedError {
    token: Token;

    constructor(message: string, token: Token) {
        if(token.kind == "newline" || token.kind == "eof") {
            super(message, Math.max(0, token.position - 1), token.position);
        } else {
            super(message, token.position, token.position + token.token.length);
        }
        this.token = token;
    }
}

type Expr = ({
    type: "binop",
    operation: "+" | "-" | "*" | "/" | "%" | "<<" | ">>" | "&" | "|" | "^",
    left: Expr,
    right: Expr,
} | {
    type: "op",
    operation: "-" | "~" | "<" | ">",
    body: Expr,
} | {
    type: "label",
    label: string,
} | {
    type: "constant",
    value: number,
}) & {
    start: number,
    end: number,
    start_line: number,
    end_line: number,
};
function parse_short_expr(stream: TokenStream): Expr {
    const next = stream.next();
    const start = next.position;
    const end = start + next.token.length;
    const start_line = next.start_line;
    const end_line = next.end_line;
    switch(next.kind) {
        case "identifier": {
            if(next.token.match(/^\$|0x/i)) {
                const value = parseInt(next.token.replace(/^\$|0x/i,""), 16);
                if(isNaN(value)) {
                    throw new ParseError("Invalid number", next);
                }
                return {type: "constant", value, start, end, start_line, end_line};
            } else if(next.token.match(/^0o/i)) {
                const value = parseInt(next.token.replace(/^0o/i,""), 8);
                if(isNaN(value)) {
                    throw new ParseError("Invalid number", next);
                }
                return {type: "constant", value, start, end, start_line, end_line};
            } else if(next.token.match(/^0b/i)) {
                const value = parseInt(next.token.replace(/^0b/i,""), 2);
                if(isNaN(value)) {
                    throw new ParseError("Invalid number", next);
                }
                return {type: "constant", value, start, end, start_line, end_line};
            } else if(next.token[0] == "'") {
                let char = String.fromCharCode(0);
                if(next.token[1] == "\\") {
                    switch(next.token[2]) {
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
                    }
                } else {
                    char = next.token[1]!;
                }
                return {type: "constant", value: char.charCodeAt(0), start, end, start_line, end_line};
            } else if(next.token.match(/^[0-9]/)) {
                const value = parseInt(next.token);
                if(isNaN(value)) {
                    throw new ParseError("Invalid number", next);
                }
                return {type: "constant", value, start, end, start_line, end_line};
            } else {
                return {type: "label", label: next.token, start, end, start_line, end_line};
            }
        }
        case "symbol":
            if(next.token.match(/-|~|<|>/)) {
                const rest = parse_short_expr(stream);
                return {type: "op", operation: next.token as "-" | "~" | "<" | ">", body: rest, start, end: stream.position(), start_line, end_line};
            } else if(next.token == "[") {
                const body = parse_expr(stream);
                if(stream.next().token != "]") {
                    throw new ParseError("Unclosed bracket", next);
                }
                return body;
            } else {
                throw new ParseError("Invalid operator", next);
            }
        case "string":
            throw new ParseError("Strings cannot be used in expressions", next);
        default:
            throw new ParseError("Expressions cannot be empty", next);
    }
}
function parse_expr(stream: TokenStream): Expr {
    let head = parse_short_expr(stream);
    while(!stream.eof() && stream.peek().kind == "symbol" && stream.peek().token.match(/^[+\-*/&|^]$|^<<$|^>>$/)) {
        const operation = stream.next().token as "+" | "-" | "*" | "/" | "%" | "<<" | ">>" | "&" | "|" | "^";
        const right = parse_short_expr(stream);
        head = {type: "binop", operation, left: head, right, start: head.start, end: right.end, start_line: head.start_line, end_line: right.end_line};
    }
    return head;
}

type Operand = {mode: ParseAddressingMode, body: Expr, start: number, end: number, start_line: number, end_line: number};
function parse_operand(stream: TokenStream): Operand {
    if(stream.eof() || stream.peek().kind == "newline") {
        const pos = stream.position();
        const line = stream.line();
        return {
            mode: "implicit",
            body: {type: "constant", value: 0, start: pos, end: pos, start_line: line, end_line: line},
            start: pos,
            end: pos,
            start_line: line,
            end_line: line
        };
    }
    const start = stream.position();
    let mode: ParseAddressingMode = "absolute";
    const first = stream.peek();
    if(first.token == "#") {
        mode = "immediate";
        stream.next();
    } else if(first.token == "(") {
        mode = "indirect";
        stream.next();
    }
    const body = parse_expr(stream);
    if(!stream.eof() && stream.peek().token == ",") {
        const comma = stream.next();
        if(mode == "absolute") {
            const index = stream.next();
            switch(index.token.toLowerCase()) {
                case "x":
                    mode = "absolute,x";
                    break;
                case "y":
                    mode = "absolute,y";
                    break;
                default:
                    throw new ParseError("Unexpected token after ,", index);
            }
        } else if(mode == "indirect") {
            const index = stream.next();
            switch(index.token.toLowerCase()) {
                case "x":
                    mode = "indirect,x";
                    break;
                case "y":
                    throw new ParseError("Indexed-indirect addressing can only use the x register", index);
                default:
                    throw new ParseError("Unexpected token after ,", index);
            }
        } else {
            throw new ParseError("Unexpected , after operand", comma);
        }
    }
    if(mode == "indirect" || mode == "indirect,x") {
        if(stream.eof() || stream.peek().token != ")") {
            throw new ParseError("Unclosed parenthesis", first);
        }
        stream.next();
        if(mode == "indirect" && !stream.eof() && stream.peek().token == ",") {
            stream.next();
            const index = stream.next();
            switch(index.token.toLowerCase()) {
                case "x":
                    throw new ParseError("Indirect-indexed addressing can only use the y register", index);
                case "y":
                    mode = "indirect,y";
                    break;
                default:
                    throw new ParseError("Unexpected token after ,", index);
            }
        }
    }
    return {mode, body, start, end: stream.position(), start_line: first.start_line, end_line: stream.line()};
}

type Instruction = {
    instruction: string,
    operand: Operand,
    start: number,
    end: number,
    start_line: number,
    end_line: number,
};
function parse_instruction(stream: TokenStream): Instruction {
    const instruction = stream.next();
    if(instruction.kind != "identifier") {
        throw new ParseError("Instructions must not be symbols", instruction);
    }
    return {
        instruction: instruction.token.toLowerCase(),
        operand: parse_operand(stream),
        start: instruction.position,
        end: stream.position(),
        start_line: instruction.start_line,
        end_line: stream.line()
    };
}

type Label = {
    name: string,
    start: number,
    end: number,
    start_line: number,
    end_line: number,
};
function parse_label(stream: TokenStream): Label {
    const start = stream.position();
    const start_line = stream.line();
    const label = stream.next();
    if(label.kind != "identifier") {
        throw new ParseError("Labels must not be symbols", label);
    }
    if(!stream.eof() && stream.peek().token == ":") {
        stream.next();
    }
    return {name: label.token, start, end: stream.position(), start_line, end_line: stream.line()};
}

type StringLiteral = {
    value: string,
    start: number,
    end: number,
    start_line: number,
    end_line: number,
};
function parse_string_expr(stream: TokenStream): StringLiteral {
    const start = stream.position();
    const start_line = stream.line();
    const string = stream.next();
    if(string.kind != "string") {
        throw new ParseError("Expected string", string);
    }
    return {value: string.token.slice(1, -1), start, end: stream.position(), start_line, end_line: stream.line()};
}

type Command = ({
    type: "label",
    body: Label,
} | {
    type: "instruction",
    body: Instruction,
} | {
    type: "org",
    base: Expr,
} | {
    type: "dc",
    length: number,
    value: Expr,
} | {
    type: "dcstring",
    length: number,
    value: StringLiteral,
} | {
    type: "ds",
    length: Expr,
    entry_size: number,
} | {
    type: "equ",
    label: Label | undefined,
    value: Expr,
}) & {
    start: number,
    end: number,
    start_line: number,
    end_line: number,
};
function parse_command(stream: TokenStream): Command {
    const name = stream.peek().token.toLowerCase();
    const start = stream.position();
    const start_line = stream.line();
    let type = "directive";
    let command: Command;
    switch(name) {
        case "org":
            stream.next();
            command = {type: "org", base: parse_expr(stream), start, end: stream.position(), start_line, end_line: stream.line()};
            break;
        case "dc.b":
        case "dc.w":
        case "byte":
        case "word": {
            stream.next();
            const lengths = {
                "dc.b": 1,
                "byte": 1,
                "dc.w": 2,
                "word": 2,
            };
            if(stream.peek().kind == "string") {
                command = {type: "dcstring", length: lengths[name], value: parse_string_expr(stream), start, end: stream.position(), start_line, end_line: stream.line()};
            } else {
                command = {type: "dc", length: lengths[name], value: parse_expr(stream), start, end: stream.position(), start_line, end_line: stream.line()};
            }
            break;
        }
        case "ds.b":
        case "ds.w":
        case "res.b":
        case "res.w": {
            stream.next();
            const lengths = {
                "ds.b": 1,
                "res.b": 1,
                "ds.w": 2,
                "res.w": 2,
            };
            command = {type: "ds", entry_size: lengths[name], length: parse_expr(stream), start, end: stream.position(), start_line, end_line: stream.line()};
            break;
        }
        case "=":
        case "equ": {
            stream.next();
            command = {type: "equ", label: undefined, value: parse_expr(stream), start, end: stream.position(), start_line, end_line: stream.line()};
            break;
        }
        default:
            type = "instruction";
            command = {type: "instruction", body: parse_instruction(stream), start, end: stream.position(), start_line, end_line: stream.line()};
            break;
    }
    if(!stream.eof() && stream.peek().kind != "newline") {
        throw new ParseError(`Unexpected token after ${type}`, stream.peek());
    }
    return command;
}
function parse_line(stream: TokenStream): Command[] {
    const indent = stream.peek();
    let label_command: Command | undefined = undefined;
    if(indent.kind != "indent") {
        const label = parse_label(stream);
        label_command = {type: "label", body: label, start: label.start, end: label.end, start_line: label.start_line, end_line: label.end_line};
    } else {
        stream.next();
    }
    if(!stream.eof() && stream.peek().kind != "newline") {
        const next = stream.peek();
        const command = parse_command(stream);
        switch(command.type) {
            case "org": {
                // label then org sets the label to the new org
                if(label_command !== undefined) {
                    return [command, label_command];
                } else {
                    return [command];
                }
            }
            case "equ": {
                if(label_command === undefined) {
                    throw new ParseError("Assignments must have a label", next);
                }
                command.label = label_command.body;
                command.start = label_command.start;
                return [command];
            }
            default:
                if(label_command !== undefined) {
                    return [label_command, command];
                } else {
                    return [command];
                }
        }
    }
    if(label_command !== undefined) {
        return [label_command];
    } else {
        return [];
    }
}

type Program = Command[];
function parse_program(stream: TokenStream): Program {
    const ret = [];
    while(!stream.eof()) {
        if(stream.peek().kind == "newline") {
            stream.next();
        }
        if(stream.eof()) {
            break;
        }
        const line = parse_line(stream);
        ret.push(...line);
    }
    return ret;
}

function parse(tokens: Token[]): Program {
    return parse_program(new TokenStream(tokens));
}

export { lex, parse };
export type { Expr, Operand, Command, Program };