import type { MakeBrand } from "@atyrode/excalidraw/common/utility-types";
import type { OrderedExcalidrawElement } from "@atyrode/excalidraw/element/types";
import { DELETED_ELEMENT_TIMEOUT, ROOM_ID_BYTES, WS_SUBTYPES } from "../constants";
import { UserIdleState } from "@atyrode/excalidraw/common/constants";
import { SocketId, AppState } from "@atyrode/excalidraw/types";
import { SceneBounds } from "@atyrode/excalidraw/element/bounds";
import { ExcalidrawElement } from "@atyrode/excalidraw/element/types";
import { 
  isInvisiblySmallElement,
  bytesToHexString,
  generateEncryptionKey
} from "@atyrode/excalidraw";

export type SyncableExcalidrawElement = OrderedExcalidrawElement &
  MakeBrand<"SyncableExcalidrawElement">;

export const isSyncableElement = (
  element: OrderedExcalidrawElement,
): element is SyncableExcalidrawElement => {
  if (element.isDeleted) {
    if (element.updated > Date.now() - DELETED_ELEMENT_TIMEOUT) {
      return true;
    }
    return false;
  }
  return !isInvisiblySmallElement(element);
};

export const getSyncableElements = (
  elements: readonly OrderedExcalidrawElement[],
) =>
  elements.filter((element) =>
    isSyncableElement(element),
  ) as SyncableExcalidrawElement[];


  const generateRoomId = async () => {
    const buffer = new Uint8Array(ROOM_ID_BYTES);
    window.crypto.getRandomValues(buffer);
    return bytesToHexString(buffer);
  };

  
export const generateCollaborationLinkData = async () => {
const roomId = await generateRoomId();
const roomKey = await generateEncryptionKey();

if (!roomKey) {
    throw new Error("Couldn't generate room key");
}

return { roomId, roomKey };
};

export const getCollaborationLink = (data: {
roomId: string;
roomKey: string;
}) => {
return `${window.location.origin}${window.location.pathname}#room=${data.roomId},${data.roomKey}`;
};

export type SocketUpdateDataSource = {
  INVALID_RESPONSE: {
    type: WS_SUBTYPES.INVALID_RESPONSE;
  };
  SCENE_INIT: {
    type: WS_SUBTYPES.INIT;
    payload: {
      elements: readonly ExcalidrawElement[];
    };
  };
  SCENE_UPDATE: {
    type: WS_SUBTYPES.UPDATE;
    payload: {
      elements: readonly ExcalidrawElement[];
    };
  };
  MOUSE_LOCATION: {
    type: WS_SUBTYPES.MOUSE_LOCATION;
    payload: {
      socketId: SocketId;
      pointer: { x: number; y: number; tool: "pointer" | "laser" };
      button: "down" | "up";
      selectedElementIds: AppState["selectedElementIds"];
      username: string;
    };
  };
  USER_VISIBLE_SCENE_BOUNDS: {
    type: WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS;
    payload: {
      socketId: SocketId;
      username: string;
      sceneBounds: SceneBounds;
    };
  };
  IDLE_STATUS: {
    type: WS_SUBTYPES.IDLE_STATUS;
    payload: {
      socketId: SocketId;
      userState: UserIdleState;
      username: string;
    };
  };
};

export type SocketUpdateDataIncoming =
  SocketUpdateDataSource[keyof SocketUpdateDataSource];

export type SocketUpdateData =
  SocketUpdateDataSource[keyof SocketUpdateDataSource] & {
    _brand: "socketUpdateData";
  };