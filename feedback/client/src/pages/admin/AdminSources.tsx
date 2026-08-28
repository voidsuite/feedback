import * as React from "react"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, type SourceStat } from "@/lib/api"

export function AdminSources() {
  const [sources, setSources] = React.useState<SourceStat[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    api.getSources()
      .then((r: { sources: SourceStat[] }) => setSources(r.sources))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const total = sources.reduce((s, x) => s + x.count, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Apps &amp; sources</h1>
        <p className="text-sm text-muted-foreground">
          Where feedback comes from. The <code className="rounded bg-muted px-1">?source=</code> param on each Void app prefills this.
        </p>
      </div>

      <Card className="p-0">
        {loading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Questions</TableHead>
                <TableHead className="text-right">Features</TableHead>
                <TableHead className="text-right">Bugs</TableHead>
                <TableHead className="text-right">Support</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((s) => (
                <TableRow key={s.source}>
                  <TableCell className="font-medium">{s.source}</TableCell>
                  <TableCell className="text-right">{s.count}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{s.questions}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{s.features}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{s.bugs}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{s.support}</TableCell>
                </TableRow>
              ))}
              {sources.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No feedback submitted yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">Total feedback across all sources: {total}</p>
    </div>
  )
}
