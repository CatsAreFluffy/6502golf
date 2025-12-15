import { RangeSet, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, ViewPlugin, hoverTooltip } from "@codemirror/view";
import { AccessType } from "./machine";

const error_decoration = Decoration.mark({class: "error"});

export type ErrorInfo = {valid : false} | {
    valid: true,
    start: number,
    end: number,
    message: string,
}

export const set_error_field = StateEffect.define<ErrorInfo>();

export const error_field = StateField.define<ErrorInfo>({
    create() {return {valid: false};},
    update(value, transaction) {
        for(const e of transaction.effects) {
            if(e.is(set_error_field)) {
                value = e.value;
            }
        }
        return value;
    },
});

export const error_extension = ViewPlugin.define((_view) => {
    return {
        decorations: RangeSet.of([]) as DecorationSet,
        update(update) {
            const field = update.view.state.field(error_field);
            if(field.valid) {
                this.decorations = RangeSet.of([error_decoration.range(field.start, field.end)]);
            } else {
                this.decorations = RangeSet.of([]);
            }
        }
    };
}, {
    decorations: v => v.decorations,
});

export const error_tooltip = hoverTooltip((view, pos, _side) => {
    const field = view.state.field(error_field);
    if(!field.valid || pos < field.start || field.end <= pos) {
        return null;
    }
    return {
        pos: field.start,
        end: field.end,
        above: true,
        create(_view) {
            const dom = document.createElement("div")
            dom.textContent = field.message;
            return {dom}
        }
    };
});

export type AccessInfo = {
    start: number,
    end: number,
    kind: AccessType,
}

export const set_access_highlight_field = StateEffect.define<AccessInfo[]>();

export const access_highlight_field = StateField.define<AccessInfo[]>({
    create() {return [];},
    update(value, transaction) {
        for(const e of transaction.effects) {
            if(e.is(set_access_highlight_field)) {
                value = e.value;
            }
        }
        return value;
    },
});

const instruction_decoration = Decoration.mark({class: "last-instruction"});
const data_decoration = Decoration.mark({class: "last-data"});
const pointer_decoration = Decoration.mark({class: "last-pointer"});
const dummy_decoration = Decoration.mark({class: "last-dummy"});

export const access_highlight_extension = ViewPlugin.define((_view) => {
    return {
        decorations: RangeSet.of([]) as DecorationSet,
        update(update) {
            const decorations = [];
            const field = update.view.state.field(access_highlight_field);
            for(const {start, end, kind} of field) {
                const decoration = {
                    instruction: instruction_decoration,
                    data: data_decoration,
                    pointer: pointer_decoration,
                    dummy: dummy_decoration,
                }[kind];
                decorations.push(decoration.range(start, end));
            }
            this.decorations = RangeSet.of(decorations);
        }
    };
}, {
    decorations: v => v.decorations,
});