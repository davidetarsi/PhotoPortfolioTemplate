/**
 * The two arrows that move an item one place earlier or later (phones, keyboard). At either
 * end of the list the arrow that cannot move is marked aria-disabled instead of disabled: a
 * disabled button loses the focus, and a keyboard user who has just moved an item to the top
 * would find themselves back at the start of the page.
 * @param {{index: number, total: number, onMove: (from: number, to: number) => void,
 *   earlierLabel: string, laterLabel: string}} props
 */
export function MoveButtons({ index, total, onMove, earlierLabel, laterLabel }) {
  const arrow = (to, label, symbol) => {
    const blocked = to < 0 || to >= total;
    return (
      <button type="button" aria-label={label} aria-disabled={blocked || undefined}
        onClick={() => { if (!blocked) onMove(index, to); }}>{symbol}</button>
    );
  };
  return (
    <>
      {arrow(index - 1, earlierLabel, '←')}
      {arrow(index + 1, laterLabel, '→')}
    </>
  );
}
