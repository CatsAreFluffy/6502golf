import { EditorState, RangeSet, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, hoverTooltip, keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";

const error_decoration = Decoration.mark({class: "error"});

export const set_error_field = StateEffect.define<[boolean, number, number, string]>();

export const error_field = StateField.define<[boolean, number, number, string]>({
    create() {return [false, 0, 0, ""];},
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
            if(field[0] && field[1] != field[2]) {
                this.decorations = RangeSet.of([error_decoration.range(field[1], field[2])]);
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
    if(!field[0] || field[1] == field[2] || pos < field[1] || field[2] <= pos) {
        return null;
    }
    return {
        pos: field[1],
        end: field[2],
        above: true,
        create(view) {
            let dom = document.createElement("div")
            dom.textContent = field[3];
            return {dom}
        }
    };
})