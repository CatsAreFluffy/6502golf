import { Context, createContext } from "react";
import { AccessType } from "fluffy-6502";

export const RangeContext: Context<Map<number, AccessType>> = createContext(new Map());