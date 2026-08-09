import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Response } from "express";
import { handlePostArtistReleaseAlert } from "./post-artist-release-alert";

const LISTENER_ID = "00000000-0000-0000-0000-0000000000aa";
const ARTIST_ID = "00000000-0000-0000-0000-0000000000bb";

type MockRes = Response & {
  statusCode: number;
  headersSent: boolean;
  jsonBodies: unknown[];
  statusCalls: number[];
};

function createMockRes(): MockRes {
  const res = {
    statusCode: 200,
    headersSent: false,
    jsonBodies: [] as unknown[],
    statusCalls: [] as number[],
    status(code: number) {
      this.statusCalls.push(code);
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      if (this.headersSent) {
        const err = new Error("Cannot set headers after they are sent to the client");
        (err as NodeJS.ErrnoException).code = "ERR_HTTP_HEADERS_SENT";
        throw err;
      }
      this.headersSent = true;
      this.jsonBodies.push(body);
      return this;
    },
  };
  return res as MockRes;
}

describe("handlePostArtistReleaseAlert", () => {
  it("first-time enable returns created true and deliveryEnabled", async () => {
    const res = createMockRes();
    let enableCalls = 0;

    await handlePostArtistReleaseAlert(
      { dbUser: { id: LISTENER_ID }, params: { artistId: ARTIST_ID } },
      res,
      async () => {
        enableCalls += 1;
        return { created: true };
      },
      async () => true,
    );

    assert.equal(enableCalls, 1);
    assert.equal(res.jsonBodies.length, 1);
    assert.deepEqual(res.jsonBodies[0], {
      enabled: true,
      created: true,
      deliveryEnabled: true,
    });
    assert.equal(res.statusCode, 200);
  });

  it("already-enabled returns created false with deliveryEnabled", async () => {
    const res = createMockRes();

    await handlePostArtistReleaseAlert(
      { dbUser: { id: LISTENER_ID }, params: { artistId: ARTIST_ID } },
      res,
      async () => ({ created: false }),
      async () => false,
    );

    assert.equal(res.jsonBodies.length, 1);
    assert.deepEqual(res.jsonBodies[0], {
      enabled: true,
      created: false,
      deliveryEnabled: false,
    });
  });

  it("subscription lookup failure still succeeds with deliveryEnabled false", async () => {
    const res = createMockRes();
    let membershipSucceeded = false;

    await handlePostArtistReleaseAlert(
      { dbUser: { id: LISTENER_ID }, params: { artistId: ARTIST_ID } },
      res,
      async () => {
        membershipSucceeded = true;
        return { created: true };
      },
      async () => {
        throw new Error("SNAPSHOT_LOOKUP_FAILED");
      },
    );

    assert.equal(membershipSucceeded, true);
    assert.deepEqual(res.jsonBodies[0], {
      enabled: true,
      created: true,
      deliveryEnabled: false,
    });
    const body = res.jsonBodies[0] as Record<string, unknown>;
    assert.equal(body.state, undefined);
    assert.equal(body.productIdentifier, undefined);
    assert.equal(body.expiresAt, undefined);
    assert.equal(body.provider, undefined);
    assert.equal(body.billingIssue, undefined);
  });

  it("self-alert rejection returns 400 once", async () => {
    const res = createMockRes();
    let enableCalls = 0;

    await handlePostArtistReleaseAlert(
      { dbUser: { id: ARTIST_ID }, params: { artistId: ARTIST_ID } },
      res,
      async () => {
        enableCalls += 1;
        return { created: true };
      },
    );

    assert.equal(enableCalls, 0);
    assert.equal(res.statusCalls.length, 1);
    assert.equal(res.statusCalls[0], 400);
    assert.equal(res.jsonBodies.length, 1);
    assert.deepEqual(res.jsonBodies[0], {
      message: "Cannot enable release alerts for yourself",
    });
  });

  it("missing artist mapped error returns 404 once", async () => {
    const res = createMockRes();

    await handlePostArtistReleaseAlert(
      { dbUser: { id: LISTENER_ID }, params: { artistId: ARTIST_ID } },
      res,
      async () => {
        throw new Error("ARTIST_NOT_FOUND");
      },
    );

    assert.equal(res.statusCalls[0], 404);
    assert.equal(res.jsonBodies.length, 1);
    assert.deepEqual(res.jsonBodies[0], { message: "Artist not found" });
  });

  it("unverified artist mapped error returns 404 once", async () => {
    const res = createMockRes();

    await handlePostArtistReleaseAlert(
      { dbUser: { id: LISTENER_ID }, params: { artistId: ARTIST_ID } },
      res,
      async () => {
        throw new Error("ARTIST_NOT_VERIFIED");
      },
    );

    assert.equal(res.statusCalls[0], 404);
    assert.equal(res.jsonBodies.length, 1);
    assert.deepEqual(res.jsonBodies[0], { message: "Artist not found" });
  });

  it("SELF_ALERT_NOT_ALLOWED from storage returns 400 once", async () => {
    const res = createMockRes();

    await handlePostArtistReleaseAlert(
      { dbUser: { id: LISTENER_ID }, params: { artistId: ARTIST_ID } },
      res,
      async () => {
        throw new Error("SELF_ALERT_NOT_ALLOWED");
      },
    );

    assert.equal(res.statusCalls[0], 400);
    assert.equal(res.jsonBodies.length, 1);
    assert.deepEqual(res.jsonBodies[0], {
      message: "Cannot enable release alerts for yourself",
    });
  });

  it("unexpected error before any response returns 500 once", async () => {
    const res = createMockRes();

    await handlePostArtistReleaseAlert(
      { dbUser: { id: LISTENER_ID }, params: { artistId: ARTIST_ID } },
      res,
      async () => {
        throw new Error("DB_DOWN");
      },
    );

    assert.equal(res.statusCalls[0], 500);
    assert.equal(res.jsonBodies.length, 1);
    assert.deepEqual(res.jsonBodies[0], {
      message: "Failed to enable release alerts",
    });
  });

  it("error after headers sent does not send a second response", async () => {
    let jsonCalls = 0;

    const successRes = {
      get headersSent() {
        return jsonCalls > 0;
      },
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(_body: unknown) {
        jsonCalls += 1;
        if (jsonCalls > 1) {
          const err = new Error("Cannot set headers after they are sent to the client");
          (err as NodeJS.ErrnoException).code = "ERR_HTTP_HEADERS_SENT";
          throw err;
        }
        return this;
      },
    } as unknown as Response;

    await assert.doesNotReject(async () => {
      await handlePostArtistReleaseAlert(
        { dbUser: { id: LISTENER_ID }, params: { artistId: ARTIST_ID } },
        successRes,
        async () => ({ created: true }),
        async () => false,
      );
    });
    assert.equal(jsonCalls, 1);

    const resAlreadySent = {
      headersSent: true,
      status() {
        assert.fail("status must not be called when headersSent");
        return this;
      },
      json() {
        assert.fail("json must not be called when headersSent");
        return this;
      },
    } as unknown as Response;

    await assert.doesNotReject(async () => {
      await handlePostArtistReleaseAlert(
        { dbUser: { id: LISTENER_ID }, params: { artistId: ARTIST_ID } },
        resAlreadySent,
        async () => {
          throw new Error("AFTER_HEADERS");
        },
      );
    });
  });
});
