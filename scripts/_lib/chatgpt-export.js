import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

function makeStableId(prefix, value) {
  return `${prefix}-${createHash("sha1").update(String(value)).digest("hex").slice(0, 16)}`;
}

function findFileRecursive(startPath, filename, depth = 0) {
  if (depth > 3 || !existsSync(startPath)) {
    return null;
  }

  const stats = statSync(startPath);

  if (stats.isFile()) {
    return basename(startPath) === filename ? startPath : null;
  }

  for (const entry of readdirSync(startPath)) {
    const fullPath = join(startPath, entry);
    const entryStats = statSync(fullPath);

    if (entryStats.isDirectory()) {
      const match = findFileRecursive(fullPath, filename, depth + 1);

      if (match) {
        return match;
      }
    } else if (entry === filename) {
      return fullPath;
    }
  }

  return null;
}

function extractMessageText(message) {
  const content = message?.content;

  if (!content) {
    return "";
  }

  if (Array.isArray(content.parts)) {
    return content.parts
      .filter((part) => typeof part === "string" && part.trim())
      .join("\n")
      .trim();
  }

  if (typeof content.text === "string") {
    return content.text.trim();
  }

  if (typeof message?.text === "string") {
    return message.text.trim();
  }

  return "";
}

function extractConversationMessages(conversation) {
  if (!conversation?.mapping || typeof conversation.mapping !== "object") {
    return [];
  }

  const messages = [];

  for (const [nodeId, node] of Object.entries(conversation.mapping)) {
    const message = node?.message;

    if (!message) {
      continue;
    }

    const role = message?.author?.role;

    if (role !== "user" && role !== "assistant") {
      continue;
    }

    const text = extractMessageText(message);

    if (!text) {
      continue;
    }

    messages.push({
      id: message.id || nodeId,
      role,
      text,
      createTime:
        Number(message.create_time || node.create_time || 0) || 0,
      metadata: {
        status: message.status || null,
        recipient: message.recipient || null
      }
    });
  }

  const uniqueById = new Map();

  for (const message of messages) {
    uniqueById.set(message.id, message);
  }

  return [...uniqueById.values()].sort((left, right) => {
    if (left.createTime && right.createTime && left.createTime !== right.createTime) {
      return left.createTime - right.createTime;
    }

    return left.id.localeCompare(right.id);
  });
}

export function resolveChatGptExportPath(inputPath) {
  const resolvedPath = resolve(inputPath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`Path does not exist: ${resolvedPath}`);
  }

  const stats = statSync(resolvedPath);

  if (stats.isFile()) {
    if (extname(resolvedPath).toLowerCase() === ".zip") {
      throw new Error(
        "ZIP import is not supported directly yet. Unzip the export and pass the extracted folder or the conversations.json file."
      );
    }

    return resolvedPath;
  }

  const conversationsPath = findFileRecursive(resolvedPath, "conversations.json");

  if (!conversationsPath) {
    throw new Error(
      "Could not find conversations.json in the provided export folder. Once your export arrives, unzip it and point this command to the extracted folder."
    );
  }

  return conversationsPath;
}

export function loadChatGptConversations(inputPath) {
  const filePath = resolveChatGptExportPath(inputPath);
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const conversations = Array.isArray(raw) ? raw : raw?.conversations;

  if (!Array.isArray(conversations)) {
    throw new Error("Unsupported ChatGPT export format: expected a conversations array.");
  }

  return {
    filePath,
    conversations: conversations
      .map((conversation, index) => {
        const externalId =
          conversation?.id || `conversation-${index + 1}`;
        const messages = extractConversationMessages(conversation);

        return {
          id: makeStableId("srcdoc", externalId),
          externalId,
          title: conversation?.title || `Conversation ${index + 1}`,
          sourceType: "chatgpt_export",
          metadata: {
            create_time: conversation?.create_time || null,
            update_time: conversation?.update_time || null,
            moderation_results: conversation?.moderation_results || null
          },
          messages: messages.map((message, messageIndex) => ({
            id: makeStableId("srcchunk", `${externalId}:${message.id}`),
            externalId: message.id,
            sequenceNo: messageIndex + 1,
            speakerRole: message.role,
            contentText: message.text,
            tokenEstimate: Math.ceil(message.text.length / 4),
            metadata: message.metadata
          }))
        };
      })
      .filter((conversation) => conversation.messages.length > 0)
  };
}
