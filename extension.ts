import { EditorState, RangeSet, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, hoverTooltip, keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";

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
        for(let e of transaction.effects) {
            if(e.is(set_error_field)) {
                value = e.value;
            }
        }
        return value;
    },
});

export const error_extension = ViewPlugin.define((view) => {
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

export const error_tooltip = hoverTooltip((view, pos, side) => {
    const field = view.state.field(error_field);
    if(!field.valid || pos < field.start || field.end <= pos) {
        return null;
    }
    return {
        pos: field.start,
        end: field.end,
        above: true,
        create(view) {
            let dom = document.createElement("div")
            dom.textContent = field.message;
            return {dom}
        }
    };
})