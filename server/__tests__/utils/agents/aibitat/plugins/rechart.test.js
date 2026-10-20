/* eslint-env jest */
const {
  rechart,
} = require("../../../../../utils/agents/aibitat/plugins/rechart.js");

function chartPayload(overrides = {}) {
  return {
    type: "bar",
    title: "Revenue by month",
    dataset: [
      { name: "Jan", revenue: 1200 },
      { name: "Feb", revenue: 1540 },
    ],
    ...overrides,
  };
}

function setup(chats = [{ from: "USER", content: "chart this" }]) {
  const functions = [];
  const aibitat = {
    chats,
    function: (definition) => functions.push(definition),
    introspect: jest.fn(),
    socket: { send: jest.fn() },
    handlerProps: { log: jest.fn() },
  };
  rechart.plugin.call(rechart).setup(aibitat);
  return { handler: functions[0].handler, aibitat, definition: functions[0] };
}

describe("create-chart plugin", () => {
  it("sends the normalized chart and stores it as a collection", async () => {
    const { handler, aibitat, definition } = setup();

    const message = await handler.call(definition, chartPayload());

    expect(message).toContain("was rendered");
    expect(aibitat.socket.send).toHaveBeenCalledTimes(1);

    const [event, payload] = aibitat.socket.send.mock.calls[0];
    expect(event).toBe("rechartVisualize");
    expect(payload.caption).toBe("");
    expect(payload.layout).toBe("stack");
    expect(payload.turnId).toEqual(expect.any(String));
    expect(payload.charts).toHaveLength(1);
    expect(payload.charts[0]).toEqual(
      expect.objectContaining({
        type: "bar",
        title: "Revenue by month",
        xKey: "name",
      })
    );

    const attributes = aibitat._replySpecialAttributes;
    expect(attributes.saveAsType).toBe("rechartVisualize");
    const stored = JSON.parse(attributes.storedResponse("Here is the chart"));
    expect(stored.caption).toBe("Here is the chart");
    expect(stored.charts).toHaveLength(1);
    expect(stored.charts[0].dataset).toEqual([
      { name: "Jan", revenue: 1200 },
      { name: "Feb", revenue: 1540 },
    ]);
  });

  it("keeps advanced presentation options in the stored chart", async () => {
    const { handler, aibitat, definition } = setup();

    await handler.call(
      definition,
      chartPayload({
        type: "waterfall",
        title: "Profit bridge",
        showValues: true,
        dataset: [
          { name: "Price", change: 100 },
          { name: "Costs", change: -30 },
        ],
      })
    );

    expect(aibitat.socket.send).toHaveBeenCalledTimes(1);
    const chart = aibitat.socket.send.mock.calls[0][1].charts[0];
    expect(chart.type).toBe("waterfall");
    expect(chart.dataset[0]).toEqual(
      expect.objectContaining({ base: 0, delta: 100, direction: "up" })
    );
    expect(chart.showValues).toBe(true);
  });

  it("normalizes and stores a sankey flow chart", async () => {
    const { handler, aibitat, definition } = setup();

    await handler.call(definition, {
      type: "sankey",
      title: "Signup flow",
      dataset: [
        { source: "Organic", target: "Free", value: 420 },
        { source: "Free", target: "Pro", value: 300 },
      ],
    });

    expect(aibitat.socket.send).toHaveBeenCalledTimes(1);
    const chart = aibitat.socket.send.mock.calls[0][1].charts[0];
    expect(chart.type).toBe("sankey");
    expect(chart.nodes).toEqual([
      { name: "Organic" },
      { name: "Free" },
      { name: "Pro" },
    ]);
    expect(chart.dataset).toEqual([
      { source: 0, target: 1, value: 420 },
      { source: 1, target: 2, value: 300 },
    ]);
  });

  it("applies a dashboard layout to the whole collection", async () => {
    const { handler, aibitat, definition } = setup();

    await handler.call(definition, chartPayload({ layout: "dashboard" }));
    expect(aibitat.socket.send.mock.calls[0][1].layout).toBe("stack");

    await handler.call(
      definition,
      chartPayload({ type: "line", title: "Revenue trend" })
    );
    const twoCharts = aibitat.socket.send.mock.calls[1][1];
    expect(twoCharts.charts).toHaveLength(2);
    expect(twoCharts.layout).toBe("grid");

    await handler.call(
      definition,
      chartPayload({ type: "area", title: "Revenue area" })
    );
    expect(aibitat.socket.send.mock.calls[2][1].layout).toBe("dashboard");
    const stored = JSON.parse(aibitat._replySpecialAttributes.storedResponse());
    expect(stored.charts).toHaveLength(3);
    expect(stored.layout).toBe("dashboard");
  });

  it("rejects invalid payloads without emitting a chart", async () => {
    const { handler, aibitat, definition } = setup();

    const message = await handler.call(
      definition,
      chartPayload({ type: "pie", dataset: [{ name: "A", note: "n/a" }] })
    );

    expect(message).toContain("Chart not created");
    expect(message).toContain("no numeric columns");
    expect(aibitat.socket.send).not.toHaveBeenCalled();
    expect(aibitat._replySpecialAttributes).toBeUndefined();
  });

  it("blocks an exact duplicate of an already rendered chart", async () => {
    const { handler, aibitat, definition } = setup();

    await handler.call(definition, chartPayload());
    const message = await handler.call(definition, chartPayload());

    expect(message).toContain("identical chart");
    expect(aibitat.socket.send).toHaveBeenCalledTimes(1);
  });

  it("allows a different chart with the same dataset", async () => {
    const { handler, aibitat, definition } = setup();

    await handler.call(definition, chartPayload());
    const message = await handler.call(
      definition,
      chartPayload({ type: "line", title: "Revenue trend" })
    );

    expect(message).toContain("was rendered");
    expect(aibitat.socket.send).toHaveBeenCalledTimes(2);
  });

  it("resends the accumulated collection on every chart in a turn", async () => {
    const { handler, aibitat, definition } = setup();

    await handler.call(definition, chartPayload());
    await handler.call(
      definition,
      chartPayload({ type: "line", title: "Revenue trend" })
    );

    const calls = aibitat.socket.send.mock.calls;
    expect(calls[0][1].charts).toHaveLength(1);
    expect(calls[0][1].layout).toBe("stack");
    expect(calls[1][1].charts).toHaveLength(2);
    expect(calls[1][1].layout).toBe("grid");
    expect(calls[1][1].turnId).toBe(calls[0][1].turnId);
  });

  it("enforces the per-turn chart budget and stores every chart", async () => {
    const { handler, aibitat, definition } = setup();

    for (let index = 0; index < 4; index += 1) {
      await handler.call(
        definition,
        chartPayload({
          title: `Chart ${index + 1}`,
          dataset: [
            { name: "A", value: index + 1 },
            { name: "B", value: index + 2 },
          ],
        })
      );
    }

    const message = await handler.call(
      definition,
      chartPayload({
        title: "Too many",
        dataset: [{ name: "A", value: 9 }],
      })
    );

    expect(message).toContain("already generated 4 charts");
    expect(aibitat.socket.send).toHaveBeenCalledTimes(4);

    const stored = JSON.parse(aibitat._replySpecialAttributes.storedResponse());
    expect(stored.charts).toHaveLength(4);
    expect(stored.layout).toBe("grid");
    expect(stored.charts.map((chart) => chart.title)).toEqual([
      "Chart 1",
      "Chart 2",
      "Chart 3",
      "Chart 4",
    ]);
  });

  it("resets the budget and collection on the next user turn", async () => {
    const chats = [{ from: "USER", content: "first turn" }];
    const { handler, aibitat, definition } = setup(chats);

    for (let index = 0; index < 4; index += 1) {
      await handler.call(
        definition,
        chartPayload({
          title: `Chart ${index + 1}`,
          dataset: [{ name: "A", value: index + 1 }],
        })
      );
    }

    chats.push({ from: "USER", content: "second turn" });
    const message = await handler.call(
      definition,
      chartPayload({
        title: "Next turn",
        dataset: [{ name: "B", value: 11 }],
      })
    );

    expect(message).toContain("was rendered");
    expect(aibitat.socket.send).toHaveBeenCalledTimes(5);
    const stored = JSON.parse(aibitat._replySpecialAttributes.storedResponse());
    expect(stored.charts).toHaveLength(1);
    expect(stored.charts[0].title).toBe("Next turn");
  });

  it("clears the collected charts after they are saved", async () => {
    const { handler, aibitat, definition } = setup();

    await handler.call(definition, chartPayload());
    aibitat._replySpecialAttributes.postSave();

    expect(aibitat._rechartCharts).toEqual([]);
  });
});
