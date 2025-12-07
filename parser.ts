import { ParseAddressingMode } from "./instructions";

type Token = {
    token: string,
    kind: "identifier" | "symbol" | "indent" | "newline" | "eof",
    position: number,
}

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
    let start_of_line = true;
    let ret: Token[] = [];
    let regexp = /([ \t]+|(?:[ \t]*(?:;[^\n]*)?\n)+(?:[ \t]+$)?|[0-9a-zA-Z_.$]+|'(?:[^\n\\']|\\.)'|<<|>>|[\(\)\[\]+-\/*|^&~,#:<>])/sy;
    regexp.lastIndex = 0;
    while(regexp.lastIndex < input.length) {
        let last_index = regexp.lastIndex;
        let match = regexp.exec(input);
        if(!match) {
            let line_regexp = /.*/y;
            line_regexp.lastIndex = last_index;
            console.log(line_regexp.lastIndex);
            let line_length = line_regexp.exec(input)![0].length;
            throw new LocatedError("Lexer error", position, position + line_length);
        }

        let token = match[1];
        // simplify whitespace tokens
        if(/\s/.exec(token)) {
            if(token.includes("\n")) {
                ret.push({token, position, kind: "newline"});
            }
            else if(start_of_line) {
                // single-line whitespace is only significant at the beginning
                ret.push({token, position, kind: "indent"});
            }
        } else if(/[0-9a-zA-Z_.$']/.exec(token)) {
            ret.push({token, position, kind: "identifier"});
        } else {
            ret.push({token, position, kind: "symbol"});
        }
        position += token.length;
        start_of_line = token.match(/\n *$/) !== null;
    }
    ret.push({token: "", position, kind: "eof"});
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
            return this.tokens[this.index];
        }
        throw new ParseError("Unexpected end of file", this.tokens.at(-1)!);
    }

    next(): Token {
        let token = this.peek();
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
};
function parse_short_expr(stream: TokenStream): Expr {
    let next = stream.next();
    const start = next.position;
    const end = start + next.token.length;
    switch(next.kind) {
        case "identifier": {
            let head: Expr;
            if(next.token[0] == "$") {
                let value = parseInt(next.token.slice(1), 16);
                if(isNaN(value)) {
                    throw new ParseError("Invalid number", next);
                }
                return {type: "constant", value, start, end};
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
                    char = next.token[1];
                }
                return {type: "constant", value: char.charCodeAt(0), start, end};
            } else if(next.token.match(/^[0-9]/)) {
                let value = parseInt(next.token);
                if(isNaN(value)) {
                    throw new ParseError("Invalid number", next);
                }
                return {type: "constant", value, start, end};
            } else {
                return {type: "label", label: next.token, start, end};
            }
        }
        case "symbol":
            if(next.token.match(/-|~|<|>/)) {
                let rest = parse_short_expr(stream);
                return {type: "op", operation: next.token as any, body: rest, start, end: stream.position()};
            } else if(next.token == "[") {
                let body = parse_expr(stream);
                if(stream.next().token != "]") {
                    throw new ParseError("Unclosed bracket", next);
                }
                return body;
            } else {
                throw new ParseError("Invalid operator", next);
            }
        default:
            throw new ParseError("Expressions cannot be empty", next);
    }
}
function parse_expr(stream: TokenStream): Expr {
    let head = parse_short_expr(stream);
    while(!stream.eof() && stream.peek().kind == "symbol" && stream.peek().token.match(/^[+\-*/&|^]$|^<<$|^>>$/)) {
        let operation = stream.next().token as "+" | "-" | "*" | "/" | "%" | "<<" | ">>" | "&" | "|" | "^";
        let right = parse_short_expr(stream);
        head = {type: "binop", operation, left: head, right, start: head.start, end: right.end};
    }
    return head;
}

type Operand = {mode: ParseAddressingMode, body: Expr};
function parse_operand(stream: TokenStream): Operand {
    if(stream.eof() || stream.peek().kind == "newline") {
        const pos = stream.position();
        return {mode: "implicit", body: {type: "constant", value: 0, start: pos, end: pos}};
    }
    let mode: ParseAddressingMode = "absolute";
    let indirect = false;
    let first = stream.peek();
    if(first.token == "#") {
        mode = "immediate";
        stream.next();
    } else if(first.token == "(") {
        mode = "indirect";
        stream.next();
    }
    let body = parse_expr(stream);
    if(!stream.eof() && stream.peek().token == ",") {
        let comma = stream.next();
        if(mode == "absolute") {
            let index = stream.next();
            switch(index.token) {
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
            let index = stream.next();
            switch(index.token) {
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
        if(mode == "indirect" && !stream.eof() && stream.next().token == ",") {
            let index = stream.next();
            switch(index.token) {
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
    return {mode, body};
}

type Instruction = {
    instruction: string,
    operand: Operand,
    start: number,
    end: number,
}
function parse_instruction(stream: TokenStream): Instruction {
    let instruction = stream.next();
    if(instruction.kind != "identifier") {
        throw new ParseError("Instructions must not be symbols", instruction);
    }
    return {instruction: instruction.token, operand: parse_operand(stream), start: instruction.position, end: stream.position()};
}

type Label = string;
function parse_label(stream: TokenStream): Label {
    let label = stream.next();
    if(label.kind != "identifier") {
        throw new ParseError("Labels must not be symbols", label);
    }
    return label.token;
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
});
function parse_command(stream: TokenStream): Command {
    let name = stream.peek().token;
    const start = stream.position();
    let type = "directive";
    let command: Command;
    switch(name) {
        case "org":
            stream.next();
            command = {type: "org", base: parse_expr(stream)};
            break;
        case "dc.b":
        case "dc.w":
        case "byte":
        case "word": {
            stream.next();
            let lengths = new Map([
                ["dc.b", 1],
                ["byte", 1],
                ["dc.w", 2],
                ["word", 2],
            ]);
            command = {type: "dc", length: lengths.get(name)!, value: parse_expr(stream)};
            break;
        }
        default:
            type = "instruction";
            command = {type: "instruction", body: parse_instruction(stream)};
            break;
    }
    if(!stream.eof() && stream.peek().kind != "newline") {
        throw new ParseError(`Unexpected token after ${type}`, stream.peek());
    }
    return command;
}
function parse_line(stream: TokenStream): Command[] {
    let ret: Command[] = [];
    let indent = stream.peek()
    if(indent.kind != "indent") {
        const label = parse_label(stream);
        ret.push({type: "label", body: label});
    } else {
        stream.next();
    }
    if(!stream.eof() && stream.peek().kind != "newline") {
        // ret.push({type: "instruction", body: parse_instruction(stream)});
        ret.push(parse_command(stream));
    }
    return ret;
}

type Program = Command[]
function parse_program(stream: TokenStream): Program {
    let ret = [];
    while(!stream.eof()) {
        if(stream.peek().kind == "newline") {
            stream.next();
        }
        if(stream.eof()) {
            break;
        }
        let line = parse_line(stream);
        console.log("prog", line, stream.index);
        // for(let command of line) {
        //     ret.push(command);
        // }
        ret.push(...line);
    }
    return ret;
}

function parse(tokens: Token[]): Program {
    return parse_program(new TokenStream(tokens));
}

export { lex, parse, Expr, Operand, Command, Program };