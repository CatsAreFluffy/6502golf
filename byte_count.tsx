import React from "react";

export default function ByteCount({ bytes, valid} : {bytes: number, valid: boolean}) {
    return <span className={valid ? "" : "invalid-byte-count"}>{bytes} byte{bytes == 1 ? "" : "s"}</span>;
}