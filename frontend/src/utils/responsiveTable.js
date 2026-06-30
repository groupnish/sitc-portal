// utils/responsiveTable.js
// Zero-markup-change helper: call this once per table-bearing page (or globally)
// to auto-tag <table> as "table-cards" and stamp each <td> with a data-label
// taken from the matching <th>, so the CSS in index.css can render it as a
// stacked card on mobile. Re-run after any data refresh / re-render.
export function applyResponsiveTableLabels(root = document) {
  const tables = root.querySelectorAll('.table-wrap table')
  tables.forEach(table => {
    table.classList.add('table-cards')
    const headerCells = Array.from(table.querySelectorAll('thead th'))
    const labels = headerCells.map(th => th.textContent.trim())
    if (!labels.length) return
    table.querySelectorAll('tbody tr').forEach(tr => {
      Array.from(tr.children).forEach((td, i) => {
        if (labels[i] !== undefined) td.setAttribute('data-label', labels[i])
      })
    })
  })
}
