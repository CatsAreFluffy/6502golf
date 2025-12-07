import { ParseAddressingMode } from "./instructions";

type Token = {
    token: string,
    kind: "identifier" | "symbol" | "indent" | "newline" | "eof",
    position: number,
}

function lex(input: string): Token[] {
    let position = 0;
    let start_of_line = true;
    let ret: Token[] = [];
    let regexp = /([ \t]+|(?:[ \t]*\n)+(?:[ \t]+$)?|[0-9a-zA-Z_.$]+|<<|>>|[\(\)\[\]+-\/*|^&,#:])/sy;
    regexp.lastIndex = 0;
    while(regexp.lastIndex < input.length) {
        let match = regexp.exec(input);
        if(!match) {
            console.error("No match for", input);
            return ret;
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
        } else if(/[0-9a-zA-Z_.$]/.exec(token)) {
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

export class ParseError extends Error {
    token: Token;

    constructor(message: string, token: Token) {
        super(message);
        this.token = token;
    }
}

type Expr = {
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
};
function parse_short_expr(stream: TokenStream): Expr {
    let next = stream.next();
    switch(next.kind) {
        case "identifier": {
            let head: Expr;
            if(next.token[0] == "$") {
                let value = parseInt(next.token.slice(1), 16);
                if(isNaN(value)) {
                    throw new ParseError("Invalid number", next);
                }
                return {type: "constant", value};
            } else if(next.token.match(/^[0-9]/)) {
                let value = parseInt(next.token);
                if(isNaN(value)) {
                    throw new ParseError("Invalid number", next);
                }
                return {type: "constant", value};
            } else {
                return {type: "label", label: next.token};
            }
        }
        case "symbol":
            if(next.token.match(/-|~|<|>/)) {
                let rest = parse_short_expr(stream);
                return {type: "op", operation: next.token as any, body: rest};
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
        head = {type: "binop", operation, left: head, right};
    }
    return head;
}

type Operand = {mode: ParseAddressingMode, body: Expr};
function parse_operand(stream: TokenStream): Operand {
    if(stream.eof() || stream.peek().kind == "newline") {
        return {mode: "implicit", body: {type: "constant", value: 0}};
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

type Instruction = [string, Operand]
function parse_instruction(stream: TokenStream): Instruction {
    let opcode = stream.next();
    if(opcode.kind != "identifier") {
        throw new ParseError("Instructions must not be symbols", opcode);
    }
    let operand = parse_operand(stream);
    if(!stream.eof() && stream.peek().kind != "newline") {
        throw new ParseError("Unexpected token after instruction", stream.peek());
    }
    return [opcode.token, operand];
}

type Label = string;
function parse_label(stream: TokenStream): Label {
    let label = stream.next();
    if(label.kind != "identifier") {
        throw new ParseError("Labels must not be symbols", label);
    }
    return label.token;
}

type Command = {
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
};
function parse_command(stream: TokenStream): Command {
    let name = stream.peek().token;
    switch(name) {
        case "org":
            stream.next();
            return {type: "org", base: parse_expr(stream)};
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
            return {type: "dc", length: lengths.get(name)!, value: parse_expr(stream)};
        }
        default:
            return {type: "instruction", body: parse_instruction(stream)}
    }
}
function parse_line(stream: TokenStream): Command[] {
    let ret: Command[] = [];
    let indent = stream.peek()
    if(indent.kind != "indent") {
        ret.push({type: "label", body: parse_label(stream)});
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