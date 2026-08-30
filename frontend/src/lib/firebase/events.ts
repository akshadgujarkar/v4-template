import { collection, addDoc, getDocs, query, orderBy, limit, where } from "firebase/firestore";
import { db } from "./config";

export interface MRLVEvent {
  id?: string;
  eventName: string;
  transactionHash: string;
  blockNumber: number;
  poolId?: string;
  lp?: string;
  amount?: string;
  timestamp: number;
  metadata?: any;
}

export async function storeEvent(event: MRLVEvent) {
  try {
    const eventsRef = collection(db, "events");
    await addDoc(eventsRef, event);
    console.log("Event indexed successfully");
  } catch (error) {
    console.error("Error storing event: ", error);
  }
}

export async function getRecentEvents(limitCount: number = 20) {
  try {
    const eventsRef = collection(db, "events");
    const q = query(eventsRef, orderBy("timestamp", "desc"), limit(limitCount));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as MRLVEvent));
  } catch (error) {
    console.error("Error fetching events: ", error);
    return [];
  }
}

export async function getEventsByUser(userAddress: string) {
    try {
      const eventsRef = collection(db, "events");
      const q = query(eventsRef, where("lp", "==", userAddress), orderBy("timestamp", "desc"), limit(50));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as MRLVEvent));
    } catch (error) {
      console.error("Error fetching events: ", error);
      return [];
    }
}
