import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-northeast-2" });
const ddb = DynamoDBDocumentClient.from(client);
const TABLE = process.env.DYNAMODB_TABLE || "counseling-sessions";

export async function saveSession(item) {
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function getSession(sessionId) {
  const { Item } = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { sessionId } })
  );
  return Item ?? null;
}

export async function listSessions() {
  const { Items } = await ddb.send(new ScanCommand({ TableName: TABLE }));
  return Items ?? [];
}

/**
 * AI 분석 완료 후 결과 업데이트
 * @param {string} sessionId
 * @param {object} analysisResult — FastAPI 응답 전체
 */
export async function updateSessionResult(sessionId, analysisResult) {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { sessionId },
      UpdateExpression:
        "SET #st = :status, analysisResult = :result, completedAt = :ts",
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: {
        ":status": "completed",
        ":result": analysisResult,
        ":ts": new Date().toISOString(),
      },
    })
  );
}

export async function saveRuptureEvents(sessionId, ruptureEvents) {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { sessionId },
      UpdateExpression: "SET ruptureEvents = :events, ruptureAnalyzedAt = :ts",
      ExpressionAttributeValues: {
        ":events": ruptureEvents,
        ":ts": new Date().toISOString(),
      },
    })
  );
}

export async function saveSummary(sessionId, summary) {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { sessionId },
      UpdateExpression: "SET summary = :summary, summaryGeneratedAt = :ts",
      ExpressionAttributeValues: {
        ":summary": summary,
        ":ts": new Date().toISOString(),
      },
    })
  );
}

export async function saveRedactedSegments(sessionId, redactedTexts) {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { sessionId },
      UpdateExpression: "SET redactedSegments = :r, redactedAt = :ts",
      ExpressionAttributeValues: {
        ":r": redactedTexts,
        ":ts": new Date().toISOString(),
      },
    })
  );
}

/**
 * 사용자가 수동으로 화자 라벨을 정정.
 * DynamoDB는 부분 nested 업데이트가 까다로워, get → 수정 → put 패턴 사용.
 */
export async function updateSegmentSpeakers(sessionId, speakers) {
  const { Item: session } = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { sessionId } })
  );
  if (!session?.analysisResult?.segments) return;

  const segs = session.analysisResult.segments;
  segs.forEach((seg, i) => {
    if (speakers[i]) seg.speaker = speakers[i];
  });

  const total = segs.reduce((s, x) => s + (x.end - x.start), 0) || 1;
  const counselorTime = segs
    .filter((x) => x.speaker === "counselor")
    .reduce((s, x) => s + (x.end - x.start), 0);
  session.analysisResult.counselor_talk_ratio = counselorTime / total;

  await ddb.send(new PutCommand({ TableName: TABLE, Item: session }));
}

export async function setSegmentNote(sessionId, segmentIdx, text) {
  const { Item: session } = await ddb.send(new GetCommand({ TableName: TABLE, Key: { sessionId } }));
  if (!session) return;
  const notes = session.notes || {};
  if (text && text.trim()) {
    notes[segmentIdx] = { text: text.trim(), updatedAt: new Date().toISOString() };
  } else {
    delete notes[segmentIdx];
  }
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { sessionId },
      UpdateExpression: "SET notes = :n",
      ExpressionAttributeValues: { ":n": notes },
    })
  );
}

export async function toggleBookmark(sessionId, segmentIdx) {
  const { Item: session } = await ddb.send(new GetCommand({ TableName: TABLE, Key: { sessionId } }));
  if (!session) return false;
  const bookmarks = session.bookmarks || [];
  const idx = bookmarks.indexOf(segmentIdx);
  let added;
  if (idx >= 0) {
    bookmarks.splice(idx, 1);
    added = false;
  } else {
    bookmarks.push(segmentIdx);
    bookmarks.sort((a, b) => a - b);
    added = true;
  }
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { sessionId },
      UpdateExpression: "SET bookmarks = :b",
      ExpressionAttributeValues: { ":b": bookmarks },
    })
  );
  return added;
}

export async function setJobStatus(sessionId, kind, status, errorMessage = null) {
  const path = `jobStatus.${kind}`;
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { sessionId },
      UpdateExpression: `SET #js = if_not_exists(#js, :empty), #js.#k = :val`,
      ExpressionAttributeNames: { "#js": "jobStatus", "#k": kind },
      ExpressionAttributeValues: {
        ":empty": {},
        ":val": { status, error: errorMessage, updatedAt: new Date().toISOString() },
      },
    })
  );
}

export async function markSessionError(sessionId, errorMessage) {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { sessionId },
      UpdateExpression: "SET #st = :status, #err = :error",
      ExpressionAttributeNames: { "#st": "status", "#err": "error" },
      ExpressionAttributeValues: {
        ":status": "error",
        ":error": errorMessage,
      },
    })
  );
}

export async function deleteSession(sessionId) {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { sessionId } }));
}
