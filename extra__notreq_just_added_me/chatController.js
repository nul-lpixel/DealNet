
//controller for getting chat (creating if not exists)

import prisma from "../configs/prisma.js";

// Helper function to ensure user exists (with retry logic)
const ensureUserExists = async (userId, userEmail = null, userName = null, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        
        if (user) {
            return user;
        }
        
        // Wait a bit before retrying (exponential backoff)
        if (i < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
        }
    }
    
    // If still not found after retries, create the user manually
    // This is a fallback in case Inngest webhook failed
    try {
        const newUser = await prisma.user.create({
            data: {
                id: userId,
                email: userEmail || `${userId}@temp.com`,
                name: userName || "User",
                image: "",
            }
        });
        return newUser;
    } catch (error) {
        // If creation fails (e.g., duplicate), try fetching one more time
        return await prisma.user.findUnique({
            where: { id: userId }
        });
    }
};

export const getChat = async (req, res) => {
    try {
        const {userId} = await req.auth();
        const {listingId,chatId} = req.body;

        // 1. Ensure user exists in DB (with retry and fallback)
        const userExists = await ensureUserExists(userId);

        if (!userExists) {
            return res.status(400).json({ 
                message: "User profile could not be synced. Please try again or contact support." 
            });
        }

        const listing = await prisma.listing.findUnique({
            where: {id: listingId}                                        
        })
        if(!listing){
            return res.status(404).json({message: "Listing not found"});
        }

        //find existing chat
        let existingChat=null;
        if(chatId){
            existingChat = await prisma.chat.findFirst({
                where: {id: chatId, OR:[{chatUserId: userId}, {ownerUserId: userId}]},
                include: {listing: true, ownerUser: true, chatUser: true, messages: true}
            })                    
        }else{
            existingChat = await prisma.chat.findFirst({
                where: {listingId,chatUserId: userId, ownerUserId: listing.ownerId},
                include: {listing: true, ownerUser: true, chatUser: true, messages: true}
            })
        }

        if(existingChat){
            res.json({chat: existingChat});
            if(existingChat.isLastMessageRead === false){
                const lastMessage = existingChat.messages[existingChat.messages.length - 1]

                const isLastMessageSendByMe = lastMessage.sender_id === userId;

                if(!isLastMessageSendByMe){
                    await prisma.chat.update({
                        where: {id: existingChat.id},
                        data: {isLastMessageRead: true},
                    })
                }
            }

            return null
        }

        const newChat=await prisma.chat.create({
            data: {
                listingId,
                chatUserId: userId,
                ownerUserId: listing.ownerId,
            }
        })

        const chatWithData = await prisma.chat.findUnique({
            where: {id: newChat.id},
            include: {listing: true, ownerUser: true, chatUser: true}
        })

        return res.json({chat: chatWithData});
                
        
    } catch (error) {
        console.log(error);
        res.status(500).json({message: error.code || error.message});
    }
}


//controller for getting all chats for user

export const getAllUserChats = async (req, res) => {
    try {
        const {userId} = await req.auth();
        
        // Ensure user exists before querying chats
        await ensureUserExists(userId);
        
        const chats = await prisma.chat.findMany({
            where: {OR:[{chatUserId: userId}, {ownerUserId: userId}]},
            include: {listing: true, ownerUser: true, chatUser: true},
            orderBy: {updatedAt: 'desc'}

        })

        if(!chats || chats.length === 0){
            return res.json({chats: []});
        }

        return res.json({chats});

    } catch (error) {
        console.log(error);
        res.status(500).json({message: error.code || error.message});
    }
}


//controller for addign message to chat
export const sendChatMessage = async (req, res) => {
    try {
        const {userId} = await req.auth();
        const {chatId, message} = req.body;

        // Ensure user exists before sending message
        await ensureUserExists(userId);

        const chat = await prisma.chat.findFirst({
            where:{
                AND: [{id: chatId} , {OR: [{chatUserId: userId}, {ownerUserId: userId}]} ]
            },
            include: {listing: true , ownerUser: true, chatUser: true}             
        })

        if(!chat){
            return res.status(404).json({message: "Chat not found"});
        }else if(chat.listing.status !== "active"){
            return res.status(400).json({message: `Listing is ${chat.listing.status}`});
        }

        const newMessage ={
            message,
            sender_id: userId,
            chatId,
            createdAt: new Date()
        }

        await prisma.message.create({
            data: newMessage
        })

        res.json({message: "Message sent", newMessage});

        await prisma.chat.update({
            where: {id: chatId},
            data: {lastMessage: newMessage.message, isLastMessageRead: false, 
                lastMessageSenderId: userId}            
        })
        
        
    } catch (error) {
        console.log(error);
        res.status(500).json({message: error.code || error.message});
    }
}
