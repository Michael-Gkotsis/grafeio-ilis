// Η σελίδα του renderBook (main/print.ts) μέσα στην εφαρμογή: προεπισκόπηση των Εντύπων και θέσεις πάνω στο χαρτί
export const PAGE_CSS = `:host{display:block}*{box-sizing:border-box}.wrap{transform-origin:0 0}
.pg{position:relative;margin:0 auto 12px;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.35);overflow:hidden}.ar{position:absolute;transform-origin:0 0}
table{border-collapse:collapse;table-layout:fixed;color:#000}td{padding:0;overflow:visible;vertical-align:bottom;font:11pt Calibri,Carlito,Arial,sans-serif}
table.grid td{outline:.5px solid #bbb}.x{display:flex;padding:0 2px;white-space:pre;overflow:hidden;line-height:1.15}.x.o{overflow:visible}
.x.w{white-space:pre-wrap;word-wrap:break-word}.x.w span{width:100%}
.hf{position:absolute;display:flex;justify-content:space-between;font:10pt Calibri,Carlito,Arial,sans-serif}.hf span{flex:1}.hf span:nth-child(2){text-align:center}.hf span:nth-child(3){text-align:right}
.picking td[data-a]{cursor:crosshair}.picking td[data-a]:hover{outline:2px solid #1a73e8;outline-offset:-2px;background:rgba(26,115,232,.08)}
td.on{outline:2px solid #d9a400;outline-offset:-2px}td.hd{background-image:linear-gradient(rgba(91,122,43,.14),rgba(91,122,43,.14))}
.mock{border-collapse:collapse;font:12px Arial}.mock td,.mock th{border:1px solid #999;padding:2px 6px}`;
