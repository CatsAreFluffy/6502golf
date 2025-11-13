type Token = {
    token: string,
    kind: "identifier" | "symbol" | "indent" | "newline" | "eof",
    line: number,
    column: number,
}

function lex(input: string): Token[] {
    let line = 1;
    let column = 1;
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
                ret.push({token, line, column, kind: "newline"});
            }
            else if(column == 1) {
                // single-line whitespace is only significant at the beginning
                ret.push({token, line, column, kind: "indent"});
            }
        } else if(/[0-9a-zA-Z_.$]/.exec(token)) {
            ret.push({token, line, column, kind: "identifier"});
        } else {
            ret.push({token, line, column, kind: "symbol"});
        }
        if(token.includes("\n")) {
            line += token.replaceAll(/[^\n]/g, "").length;
            column = token.length - token.lastIndexOf("\n");
        } else {
            column += token.length;
        }
    }
    ret.push({token: "", line, column, kind: "eof"});
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

class ParseError extends Error {
    line: number;
    column: number;

    constructor(message: string, token: Token) {
        super(message);
        this.line = token.line;
        this.column = token.column;
    }
}

type Expr = number | string;
function parse_expr(stream: TokenStream): Expr {
    let value = stream.next();
    if(value.kind == "newline") {
        throw new ParseError("Instructions must have arguments", value);
    }
    if(value.kind == "symbol") {
        throw new ParseError("Instruction arguments must not be symbols", value);
    }
    let body: number | string = 0;
    if(value.token[0] == "$") {
        body = parseInt(value.token.slice(1), 16);
    } else if (value.token[0].match(/[0-9]/)) {
        body = parseInt(value.token);
    } else {
        body = value.token;
    }
    if(typeof body == "number" && isNaN(body)) {
        throw new ParseError("Invalid number", value);
    }
    return body;
}

type AddressingMode =  "absolute" | "absolute,x" | "absolute,y" | "immediate" | "implicit";
type Operand = {mode: AddressingMode, body: Expr};
function parse_operand(stream: TokenStream): Operand {
    if(stream.eof() || stream.peek().kind == "newline") {
        return {mode: "implicit", body: 0};
    }
    let mode: AddressingMode = "absolute";
    if(stream.peek().token == "#") {
        mode = "immediate";
        stream.next();
    }
    let body = parse_expr(stream);
    if(!stream.eof() && stream.peek().token == ",") {
        let comma = stream.next();
        if(mode != "absolute") {
            throw new ParseError("Unexpected , after operand", comma);
        }
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

export { lex, parse, Expr, AddressingMode, Operand, Command, Program };