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
