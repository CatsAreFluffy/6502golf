import { EditorState, RangeSet, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";

const error_decoration = Decoration.mark({class: "error"});

export const set_error_field = StateEffect.define<[boolean, number, number]>();

export const error_field = StateField.define<[boolean, number, number]>({
    create() {return [false, 0, 0];},
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