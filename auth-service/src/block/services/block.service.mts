import { db, broker } from "../../resources.mjs";

const table = "user_blocks";
const eventSchemaMap = {
  created: "userBlock.created",
  deleted: "userBlock.deleted",
};

interface BlockRow {
  id: string;
  user_id: string;
  block_user_id: string;
}

class BlockService {
  async block(userId: string, blockUserId: string) {
    const findUser = await db.findById("users", blockUserId);
    if (!findUser) {
      return {
        success: false,
        message: "USER_NOT_FOUND",
      };
    }

    const checkBlock = await db.raw<{ rows: BlockRow[] }>(
      `SELECT * FROM ${table} WHERE user_id = :user_id AND block_user_id = :block_user_id ORDER BY id DESC LIMIT 1`,
      {
        user_id: userId,
        block_user_id: blockUserId,
      },
    );

    if (checkBlock && checkBlock.rows.length > 0) {
      return {
        success: false,
        message: "USER_ALREADY_BLOCKED",
      };
    }

    const createRow = await db.insert(table, {
      user_id: userId,
      block_user_id: blockUserId,
    });

    if (!createRow) {
      return {
        success: false,
        message: "USER_WAS_NOT_BLOCKED",
      };
    }

    await broker.send(eventSchemaMap.created, createRow);

    return {
      success: true,
    };
  }

  async unblock(userId: string, blockUserId: string) {
    const findUser = await db.findById("users", blockUserId);
    if (!findUser) {
      return {
        success: false,
        message: "USER_NOT_FOUND",
      };
    }

    const checkBlock = await db.raw<{ rows: BlockRow[] }>(
      `SELECT * FROM ${table} WHERE user_id = :user_id AND block_user_id = :block_user_id ORDER BY id DESC LIMIT 1`,
      {
        user_id: userId,
        block_user_id: blockUserId,
      },
    );

    if (!checkBlock || checkBlock.rows.length === 0) {
      return {
        success: false,
        message: "USER_NOT_BLOCKED",
      };
    }

    const deleteRow = await db.deleteById(table, checkBlock.rows[0]!.id);
    if (!deleteRow) {
      return {
        success: false,
        message: "USER_WAS_NOT_UNBLOCKED",
      };
    }

    await broker.send(eventSchemaMap.deleted, deleteRow);

    return {
      success: true,
    };
  }
}

export default BlockService;
