import type { Sheet } from "../../rules/derive";
import type { Character } from "../../rules/persistence/character";
import type { RollTarget } from "../RollDialog";

export interface TabProps {
  sheet: Sheet;
  character: Character;
  /** Applies an undoable change with a label. */
  update: (label: string, fn: (d: Character) => void) => void;
  onRoll: (t: RollTarget) => void;
}
