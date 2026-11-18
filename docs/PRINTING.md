# Printing

Thermal ESC/POS tickets sent through CUPS (`lp -o raw`).

```
printing/
  domain/            EscPosBuilder, text sanitizer, ticket types, PrinterPort + PRINTER_PORT token
  application/
    ticket-formatters/   pure functions: formatOrderTicket, formatPaymentReceipt, formatTestTicket
  infrastructure/    CupsPrinterAdapter (lpstat / lp via execFile, no shell)
  printing.service.ts  orchestration: resolve printer, load data from Prisma, format, send
```

- Public API used by `orders`, `payments` and `system`: `listPrinters`, `getDefaultPrinter`,
  `printTest`, `printOrder`, `printOrderFromDatabase`, `printPaymentReceipt`,
  `printPaymentReceiptFromDatabase`. All print methods return `{ success, message }` and never throw.
- The printer name is validated against the `lpstat` list before reaching `lp`.
- Text is transliterated to ASCII (accents, `ñ`) because most thermal printers lack UTF-8.
- Formatters receive `now: Date`, so output is deterministic and unit-testable.
- To support another backend (network socket, mock), implement `PrinterPort` and rebind
  `PRINTER_PORT` in `PrintingModule`.
