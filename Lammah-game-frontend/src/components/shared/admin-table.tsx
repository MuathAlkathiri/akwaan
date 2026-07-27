import type { ReactNode } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AdminTableColumn<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  className?: string;
}

interface AdminTableProps<Row> {
  rows: Row[];
  columns: Array<AdminTableColumn<Row>>;
  getRowKey: (row: Row) => string;
  caption?: string;
}

export function AdminTable<Row>({
  rows,
  columns,
  getRowKey,
  caption,
}: AdminTableProps<Row>) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        {caption && <caption className="sr-only">{caption}</caption>}
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key} className={column.className}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={getRowKey(row)}>
              {columns.map((column) => (
                <TableCell key={column.key} className={column.className}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
