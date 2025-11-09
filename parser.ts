type Token = {
    token: string,
    line: number,
    column: number,
}

function lex(input: string): Token[] {
    let line = 1;
    let column = 1;
    let ret: Token[] = [];
    while(input.length) {
        let match = /^([ \t]+|(?:[ \t]*\n)+|[0-9a-zA-Z_.$]+|[\(\)\[\]+-\/*|^&,#:])(.*)$/s.exec(input);
        if(!match) {
            console.error("No match for", input);
            return ret;
        }

        let token = match[1];
        let result = {token, line, column}
        // simplify whitespace tokens
        if(/\s/.exec(token)) {
            // if(/\n[ \t].*$/.exec(input)) {
            //     result.token = "\n ";
            //     ret.push(result);
            // } else 
            if(token.includes("\n")) {
                result.token = "\n";
                ret.push(result);
            }
            else if(column == 1) {
                // single-line whitespace is only significant at the beginning
                ret.push(result);
            }
        } else {
            ret.push(result);
        }
        if(token.includes("\n")) {
            line += token.replaceAll(/[^\n]/g, "").length;
            column = token.length - token.lastIndexOf("\n");
        } else {
            column += token.length;
        }

        let rest = match[2];
        if(rest.length >= input.length) {
            console.error("Length increased after token", input, rest);
            return ret;
        }
        input = rest;
    }
    return ret;
}

export { lex };