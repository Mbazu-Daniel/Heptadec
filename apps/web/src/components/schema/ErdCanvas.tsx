import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  IconArrowsMaximize,
  IconLayoutGrid,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import "@xyflow/react/dist/style.css";
import type {
  ISchemaRelationship,
  ISchemaTable,
} from "@heptadec/api/schema-contracts";
import {
  arrangeTables,
  columnListHeight,
  hiddenColumnCount,
  MAX_VISIBLE_COLUMNS,
  referencedBy,
  referencesFrom,
} from "./schema-model";
import { ColumnGlyph } from "./SchemaTree";

interface ITableNodeData extends Record<string, unknown> {
  table: ISchemaTable;
  relationships: ISchemaRelationship[];
  selected: boolean;
  hotEdge: string | null;
  onToggleEdge: (edgeId: string) => void;
}

type TableNode = Node<ITableNodeData, "table">;

function TableCard({ data }: NodeProps<TableNode>) {
  const { table, relationships, selected, hotEdge, onToggleEdge } = data;
  const [tab, setTab] = useState<"columns" | "dependencies">("columns");

  const carries = referencesFrom(table.name, relationships);
  const carried = referencedBy(table.name, relationships);
  const dependencyCount = carries.size + carried.size;
  const hidden = hiddenColumnCount(table);
  const listHeight = columnListHeight(table);
  const shown = selected ? table.columns : table.columns.slice(0, MAX_VISIBLE_COLUMNS);

  return (
    <div className="erd-card" data-selected={selected}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      <div className="erd-card__header">
        <span className="erd-card__name">{table.name}</span>
        <span className="erd-card__count">{table.columns.length}</span>
      </div>

      <div className="erd-card__tabs">
        <button
          type="button"
          className="erd-card__tab"
          data-active={tab === "columns"}
          onClick={() => setTab("columns")}
        >
          Columns
        </button>
        <button
          type="button"
          className="erd-card__tab"
          data-active={tab === "dependencies"}
          onClick={() => setTab("dependencies")}
        >
          Dependencies{dependencyCount > 0 ? ` · ${dependencyCount}` : ""}
        </button>
      </div>

      {tab === "columns" ? (
        <div
          className="erd-card__columns"
          style={{ height: listHeight }}
          data-scroll={selected}
        >
          {shown.map((column) => (
            <div key={column.name} className="erd-card__column">
              <span className="text-muted-foreground">
                <ColumnGlyph
                  dataType={column.dataType}
                  foreign={carries.has(column.name)}
                />
              </span>
              <span
                className="erd-card__column-name"
                data-primary={column.primaryKey}
              >
                {column.name}
              </span>
              <span className="erd-card__column-type" title={column.dataType}>
                {column.dataType}
              </span>
            </div>
          ))}
          {!selected && hidden > 0 ? (
            <div className="erd-card__more">
              +{hidden} more — select the table to see every column
            </div>
          ) : null}
        </div>
      ) : dependencyCount === 0 ? (
        <div className="erd-card__more">No foreign keys touch this table.</div>
      ) : (
        <>
          {[...carries.values()].map((edge) => (
            <button
              key={edge.id}
              type="button"
              className="erd-card__dependency"
              data-active={hotEdge === edge.id}
              onClick={() => onToggleEdge(edge.id)}
              title="Trace this foreign key"
            >
              {edge.fromColumn} → {edge.toTable}.{edge.toColumn}
            </button>
          ))}
          {[...carried.values()].map((edge) => (
            <button
              key={edge.id}
              type="button"
              className="erd-card__dependency"
              data-active={hotEdge === edge.id}
              onClick={() => onToggleEdge(edge.id)}
              title="Trace this foreign key"
            >
              {edge.fromTable}.{edge.fromColumn} → {edge.toColumn}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

const nodeTypes = { table: TableCard };

function CanvasControls({ onArrange }: { onArrange: () => void }) {
  const flow = useReactFlow();
  return (
    <div className="erd-controls">
      <button
        type="button"
        title="Zoom in"
        aria-label="Zoom in"
        onClick={() => flow.zoomIn()}
      >
        <IconZoomIn size={15} />
      </button>
      <button
        type="button"
        title="Zoom out"
        aria-label="Zoom out"
        onClick={() => flow.zoomOut()}
      >
        <IconZoomOut size={15} />
      </button>
      <button
        type="button"
        title="Fit the diagram"
        aria-label="Fit the diagram"
        onClick={() => flow.fitView({ padding: 0.15, duration: 250 })}
      >
        <IconArrowsMaximize size={15} />
      </button>
      <button
        type="button"
        data-wide="true"
        onClick={onArrange}
        title="Put every card back where the layout put it"
      >
        <span className="flex items-center gap-1.5">
          <IconLayoutGrid size={13} />
          Auto-arrange
        </span>
      </button>
    </div>
  );
}

function Diagram({
  tables,
  relationships,
  selected,
  onSelect,
}: {
  tables: ISchemaTable[];
  relationships: ISchemaRelationship[];
  selected: string | null;
  onSelect: (table: string) => void;
}) {
  const spots = useMemo(
    () => arrangeTables(tables, relationships),
    [tables, relationships],
  );
  const byName = useMemo(
    () => new Map(tables.map((table) => [table.name, table])),
    [tables],
  );
  const [hotEdge, setHotEdge] = useState<string | null>(null);

  const toggleEdge = useCallback((edgeId: string): void => {
    setHotEdge((current) => (current === edgeId ? null : edgeId));
  }, []);

  const laidOut = useCallback(
    (): TableNode[] =>
      spots.map((spot) => ({
        id: spot.id,
        type: "table" as const,
        position: { x: spot.x, y: spot.y },
        width: spot.width,
        height: spot.height,
        style: { width: spot.width, height: spot.height },
        data: {
          table: byName.get(spot.id)!,
          relationships,
          selected: false,
          hotEdge: null,
          onToggleEdge: toggleEdge,
        },
      })),
    [spots, byName, relationships, toggleEdge],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<TableNode>(laidOut());
  const [arrangeToken, setArrangeToken] = useState(0);
  useEffect(() => {
    setNodes(laidOut());
  }, [laidOut, arrangeToken, setNodes]);
  useEffect(() => {
    setHotEdge(null);
  }, [tables]);

  useEffect(() => {
    setNodes((current) =>
      current.map((node) =>
        node.data.selected === (selected === node.id) &&
        node.data.hotEdge === hotEdge
          ? node
          : {
              ...node,
              data: {
                ...node.data,
                selected: selected === node.id,
                hotEdge,
              },
            },
      ),
    );
  }, [selected, hotEdge, setNodes]);

  const drawn = useMemo((): Edge[] => {
    const names = new Set(tables.map((table) => table.name));
    return relationships
      .filter((edge) => names.has(edge.fromTable) && names.has(edge.toTable))
      .map((edge) => {
        const hot = edge.id === hotEdge;
        const color = hot ? "var(--erd-accent)" : "var(--erd-edge)";
        return {
          id: edge.id,
          source: edge.toTable,
          target: edge.fromTable,
          label: edge.fromColumn,
          animated: hot,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color,
          },
          style: { stroke: color, strokeWidth: hot ? 2.5 : 1.5 },
          labelStyle: {
            fill: hot ? "var(--erd-accent)" : "var(--erd-subtle)",
            fontSize: 10,
          },
          labelBgStyle: { fill: "var(--erd-labelbg)" },
        };
      });
  }, [relationships, tables, hotEdge]);

  const [edges, setEdges, onEdgesChange] = useEdgesState(drawn);
  useEffect(() => {
    setEdges(drawn);
  }, [drawn, setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => onSelect(node.id)}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={18}
        size={1}
        color="var(--erd-dot)"
      />
      <CanvasControls onArrange={() => setArrangeToken((n) => n + 1)} />
      <MiniMap
        pannable
        zoomable
        className="erd-minimap"
        maskColor="var(--erd-mask)"
        nodeColor="var(--erd-minimap-node)"
      />
    </ReactFlow>
  );
}

export function ErdCanvas(props: {
  tables: ISchemaTable[];
  relationships: ISchemaRelationship[];
  selected: string | null;
  onSelect: (table: string) => void;
}) {
  return (
    <div className="erd erd-canvas relative h-full w-full min-h-0 min-w-0 overflow-hidden">
      <ReactFlowProvider>
        <Diagram {...props} />
      </ReactFlowProvider>
    </div>
  );
}
