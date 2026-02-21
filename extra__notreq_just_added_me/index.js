import { Inngest } from "inngest";
import prisma from "../configs/prisma.js";

// Create a client to send and receive events
export const inngest = new Inngest({ id: "profile-marketplace" });

//Inngest Function to save our data to the database
const syncUserCreation = inngest.createFunction(
  { id: "sync-user-from-clerk" },
  { event: "clerk/user.created" },
  async ({ event }) => {
    const {data}=event

    console.log("🔵 Inngest: User creation event received for user:", data.id);

    try {
        //check if user already exists in the database
        const user = await prisma.user.findFirst({
            where :{id: data.id}
        })
        
        if(user){
            console.log("🟡 User already exists, updating:", data.id);
            //update user data if it already exists
            await prisma.user.update({
                where :{id: data.id},
                data :{
                    email: data?.email_addresses[0]?.email_address,
                    name: data?.first_name + " " + data?.last_name,
                    image: data?.image_url,
                }
            })
            console.log("✅ User updated successfully:", data.id);
            return { success: true, action: "updated" };
        }
        
        console.log("🟢 Creating new user:", data.id);
        await prisma.user.create({
            data :{
                id: data.id,
                email: data?.email_addresses[0]?.email_address,
                name: data?.first_name + " " + data?.last_name,
                image: data?.image_url,
            }
        })
        console.log("✅ User created successfully:", data.id);
        return { success: true, action: "created" };
    } catch (error) {
        console.error("❌ Error syncing user creation:", error);
        throw error; // Re-throw to let Inngest retry
    }
  },
);

//Inngest function to delete user from database
const syncUserDeletion = inngest.createFunction(
  { id: "delete-user-with-clerk" },
  { event: "clerk/user.deleted" },
  async ({ event }) => {
    const {data}=event
    
    console.log("🔵 Inngest: User deletion event received for user:", data.id);
    
    try {
        const listings = await prisma.listing.findMany({
            where :{userId: data.id}
        })

        const chats = await prisma.chat.findMany({
            where :{ OR: [{ownerUserId: data.id}, {chatUserId: data.id} ]}
        })

        const transactions = await prisma.transaction.findMany({
            where :{userId: data.id}        
        })

        if(listings.length === 0 && chats.length === 0 && transactions.length === 0){
            await prisma.user.delete({
                where :{id: data.id}
            })
            console.log("✅ User deleted successfully:", data.id);
            return { success: true, action: "deleted" };
        } else {
            await prisma.listing.updateMany({
                where: {ownerId: data.id},
                data: {status: "inactive"}
            })
            console.log("🟡 User has dependencies, listings set to inactive:", data.id);
            return { success: true, action: "inactivated" };
        }
    } catch (error) {
        console.error("❌ Error syncing user deletion:", error);
        throw error;
    }
  },
);

//Inngest function to update userdata in database
const syncUserUpdation = inngest.createFunction(
  { id: "update-user-from-clerk" },
  { event: "clerk/user.updated" },
  async ({ event }) => {
    const {data}=event

    console.log("🔵 Inngest: User update event received for user:", data.id);
    
    try {
        await prisma.user.update({
            where: {id: data.id},
            data :{            
                email: data?.email_addresses[0]?.email_address,
                name: data?.first_name + " " + data?.last_name,
                image: data?.image_url,
            }
        })
        console.log("✅ User updated successfully:", data.id);
        return { success: true, action: "updated" };
    } catch (error) {
        console.error("❌ Error syncing user update:", error);
        throw error;
    }
  },
);

// Create an empty array where we'll export future Inngest functions
export const functions = [
    syncUserCreation,
    syncUserDeletion,
    syncUserUpdation
];
