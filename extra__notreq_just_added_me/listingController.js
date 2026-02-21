import imageKit from "../configs/imageKit.js";
import prisma from "../configs/prisma.js";
import fs from "fs";


// Helper function to ensure user exists (with retry logic)
const ensureUserExists = async (userId, retries = 3) => {
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
    try {
        const newUser = await prisma.user.create({
            data: {
                id: userId,
                email: `${userId}@temp.com`,
                name: "User",
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


//controller for adding listing to database

export const addListing = async (req, res) => {
    try {
        const {userId}=await req.auth();
        
        // Ensure user exists before creating listing
        await ensureUserExists(userId);
        
        if(req.plan !== "premium"){
            const listingCount = await prisma.listing.count({
                where: {ownerId: userId}
            });
            if(listingCount >= 5){
                return res.status(400).json({message: "You have reached the free listing limit"});
            }
        }
        const accountDetails = JSON.parse(req.body.accountDetails);
        
        accountDetails.followers_count = parseFloat(accountDetails.followers_count);
        accountDetails.engagement_rate = parseFloat(accountDetails.engagement_rate);
        accountDetails.monthly_views = parseFloat(accountDetails.monthly_views);
        accountDetails.price = parseFloat(accountDetails.price);
        accountDetails.platform = accountDetails.platform.toLowerCase();
        accountDetails.niche = accountDetails.niche.toLowerCase();

        accountDetails.username.startsWith("@") ? accountDetails.username = accountDetails.username.slice(1) : null;

        const uploadImages = req.files.map(async (file) =>{
            const response = await imageKit.files.upload({
                file: fs.createReadStream(file.path),
                fileName: `${Date.now()}.png`,
                folder: 'DealNet',
                transformation: {pre: "w-1280, h-auto"}
                });

            return response.url;
        });


        //wait for all uploads to complete
        const images = await Promise.all(uploadImages);

        const listing = await prisma.listing.create({
            data: {                
                ownerId: userId,
                images,
                ...accountDetails                
            }
        })
        return res.status(201).json({message: "Account Listed successfully", listing});        

    } catch (error) {
        console.log(error);
        res.status(500).json({message: error.code || error.message});
    }     
}


//Controller for getting all public listings

export const getAllPublicListing = async (req, res) => {
    try {
        const listings = await prisma.listing.findMany({
            where: {status: "active"},
            include: {owner: true},
            orderBy: {createdAt: "desc"},
        })
        if(!listings || listings.length === 0){
            return res.json({listings: []});
        }

        return res.json({listings});        
    } catch (error) {
        console.log(error);
        res.status(500).json({message: error.code || error.message});
        
    }
}


//controller for getting all user listings
export const getAllUserListing = async (req, res) => {
    try {
        const {userId} =  await req.auth();

        // Ensure user exists with retry logic
        const user = await ensureUserExists(userId);
        
        // Safety check: If user still doesn't exist after retries
        if (!user) {
            return res.json({ 
                listings: [], 
                balance: { earned: 0, withdrawn: 0, available: 0 } 
            });
        }
        
        //get all listings except deleted
        const listings = await prisma.listing.findMany({
            where: {ownerId: userId, status: {not: "deleted"}},            
            orderBy: {createdAt: "desc"},
        })

        const balance ={
            earned: user.earned || 0,
            withdrawn: user.withdrawn || 0,
            available: (user.earned || 0) - (user.withdrawn || 0),
        }

        if(!listings || listings.length === 0){
            return res.json({listings: [], balance});
        }
        return res.json({listings, balance});      
    } catch (error) {
        console.log(error);
        res.status(500).json({message: error.code || error.message});
        
    }
}



//controller for updating listing in database
// export const updateListing = async (req, res) => {
//     try {
//         const {userId} = await req.auth();
        
//         const accountDetails = JSON.parse(req.body.accountDetails);

//         if(req.files.length + accountDetails.existingImages.length > 5){
//             return res.status(400).json({message: "You can only upload upto 5 images"});
//         }

//         accountDetails.followers_count = parseFloat(accountDetails.followers_count);
//         accountDetails.engagement_rate = parseFloat(accountDetails.engagement_rate);
//         accountDetails.monthly_views = parseFloat(accountDetails.monthly_views);
//         accountDetails.price = parseFloat(accountDetails.price);
//         accountDetails.platform = accountDetails.platform.toLowerCase();
//         accountDetails.niche = accountDetails.niche.toLowerCase();

//         accountDetails.username.startsWith("@") ? accountDetails.username = accountDetails.username.slice(1) : null;

//         const listing = await prisma.listing.update({
//             where: {id: accountDetails.id, ownerId: userId},
//             data: accountDetails,
//         });

//         if(!listing){
//             return res.status(404).json({message: "Listing not found"});
//         }

//         if(listing.status === "sold"){
//             return res.status(400).json({message: "You cannot update a sold listing"});
//         }

//         if(req.files.length > 0){
//             const uploadImages = req.files.map(async (file) =>{

//             const response = await imageKit.files.upload({
//                 file: fs.createReadStream(file.path),
//                 fileName: `${Date.now()}.png`,
//                 folder: 'DealNet',
//                 transformation: {pre: "w-1280, h-auto"}
//                 });

//             return response.url;
//             })
//             const images = await Promise.all(uploadImages);

//             const listing =await prisma.listing.update({
//                 where: {id: accountDetails.id, ownerId: userId},
//                 data: {
//                     ownerId: userId,
//                     ...accountDetails,
//                     images: [...accountDetails.images, ...images]
//                 },
//             })
//              return res.json({message: "Listing updated successfully", listing});
//         }

//         return res.json({message: "Listing updated successfully", listing});

//     } catch (error) {
//         console.log(error);
//         res.status(500).json({message: error.code || error.message});
//     }
// }


export const updateListing = async (req, res) => {
    try {
        const {userId} = await req.auth(); // ✅ Fixed: removed 'await'
        
        const accountDetails = JSON.parse(req.body.accountDetails);

        // ✅ Add safety check for existingImages
        const existingImages = Array.isArray(accountDetails.existingImages) 
            ? accountDetails.existingImages 
            : [];
        
        const newFilesCount = req.files?.length || 0;
        
        if(newFilesCount + existingImages.length > 5){
            return res.status(400).json({message: "You can only upload upto 5 images"});
        }

        // Convert numeric fields
        accountDetails.followers_count = parseFloat(accountDetails.followers_count);
        accountDetails.engagement_rate = parseFloat(accountDetails.engagement_rate);
        accountDetails.monthly_views = parseFloat(accountDetails.monthly_views);
        accountDetails.price = parseFloat(accountDetails.price);
        
        // Convert boolean fields
        accountDetails.verified = Boolean(accountDetails.verified);
        accountDetails.monetized = Boolean(accountDetails.monetized);
        
        // Convert string fields
        accountDetails.platform = accountDetails.platform.toLowerCase();
        accountDetails.niche = accountDetails.niche.toLowerCase();

        if(accountDetails.username.startsWith("@")) { // ✅ Fixed typo: startsWith
            accountDetails.username = accountDetails.username.slice(1);
        }

        // Remove fields we don't want to update directly
        delete accountDetails.existingImages;
        delete accountDetails.images;

        const listing = await prisma.listing.findUnique({
            where: {id: accountDetails.id, ownerId: userId},
        });

        if(!listing){
            return res.status(404).json({message: "Listing not found"});
        }

        if(listing.status === "sold"){
            return res.status(400).json({message: "You cannot update a sold listing"});
        }

        // Handle new image uploads
        let newImages = [];
        if(req.files && req.files.length > 0){
            const uploadPromises = req.files.map(async (file) => {
                const response = await imageKit.files.upload({
                    file: fs.createReadStream(file.path),
                    fileName: `${Date.now()}.png`,
                    folder: 'DealNet',
                    transformation: {pre: "w-1280, h-auto"}
                });
                return response.url;
            });
            newImages = await Promise.all(uploadPromises);
        }

        // Combine existing and new images
        const allImages = [...existingImages, ...newImages];

        // Update the listing
        const updatedListing = await prisma.listing.update({
            where: {id: accountDetails.id, ownerId: userId},
            data: {
                ...accountDetails,
                images: allImages,
            },
        });

        return res.json({message: "Listing updated successfully", listing: updatedListing});

    } catch (error) {
        console.log(error);
        res.status(500).json({message: error.code || error.message});
    }
}

export const toggleStatus = async (req, res) => {
    try {
        const {userId} = await req.auth();
        const {id}=req.params;

        const listing = await prisma.listing.findFirst({
            where: {id, ownerId: userId}
        });

        if(!listing){
            return res.status(404).json({message: "Listing not found"});
        }

        if(listing.status === "sold" || listing.status === "deleted"){
            return res.status(400).json({message: `${listing.status} listing cannot be toggled`});
        }

        await prisma.listing.update({
            where: {id},
            data: {status: listing.status === "active" ? "inactive" : "active"},
        })

        return res.json({message: "Listing status updated successfully",
            listing});        
        
    } catch (error) {
        console.log(error);
        res.status(500).json({message: error.code || error.message});
    }
}


export const deleteUserListing = async (req, res) => {
    try {
        const {userId} = await req.auth();
        const {listingId}=req.params;

        const listing = await prisma.listing.findFirst({
            where: {id:listingId, ownerId: userId},
            include:{owner: true}
        });

        if(!listing){
            return res.status(404).json({message: "Listing not found"});
        }

        if(listing.status === "sold"){
            return res.status(400).json({message: "Sold listing cannot be deleted"});
        }

        //if password has been changes
        if(listing.isCredentialChanged){
            //send email to owner

        }

        await prisma.listing.update({
            where: {id:listingId, ownerId: userId},
            data: {status: "deleted"},
        })

        return res.json({message: "Listing deleted successfully"});
                        

    } catch (error) {
        console.log(error);
        res.status(500).json({message: error.code || error.message});
        
    }
}

export const addCredential =async (req, res) => {
    try {
        const {userId} = await req.auth();        
        const {listingId,credential} = req.body;

        if(credential.length===0 || !listingId){
            return res.status(400).json({message: "Missing Fields"});
        }

        const listing = await prisma.listing.findFirst({
            where: {id:listingId, ownerId: userId},
            
        });

        if(!listing){
            return res.status(404).json({message: "Listing not found or you are not the owner"});
        }

        await prisma.credential.create({            
            data: {
                listingId,
                originalCredential: credential,
            }
        })

        await prisma.listing.update({
            where: {id: listingId},
            data: {isCredentialSubmitted: true},
        })

        return res.json({message: "Credential added successfully"});

    } catch (error) {
        console.log(error);
        res.status(500).json({message: error.code || error.message});
    }
}


//original markFeatured without toggle and only one logic ..by me
// export const markFeatured = async (req, res) => {
//     try {
//         const {id} = req.params;
//         const {userId} = await req.auth();

//         if(req.plan !== "premium"){
//             return res.status(403).json({message: "Premium plan required "});
//         }

//         //unset all other featured listings
//         await prisma.listing.updateMany({
//             where: {ownerId: userId},
//             data: {featured: false},
//         })

//         //mark the listing as featured
//         const listing = await prisma.listing.update({
//             where: {id},
//             data: {featured: true},
//         })

//         return res.json({message: "Listing marked as featured", listing});
        
//     } catch (error) {
//         console.log(error);
//         res.status(500).json({message: error.code || error.message});
        
//     }
// }



//markFeatured with toggle and only one logic ..by gemini
export const markFeatured = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = await req.auth(); // Corrected: removed 'await'

        if (req.plan !== "premium") {
            return res.status(403).json({ message: "Premium plan required" });
        }

        // 1. Find the current listing to check its status
        const currentListing = await prisma.listing.findUnique({
            where: { id, ownerId: userId }
        });

        if (!currentListing) {
            return res.status(404).json({ message: "Listing not found" });
        }

        // 2. Toggle Logic
        if (currentListing.featured) {
            // If already featured, just turn it off
            await prisma.listing.update({
                where: { id },
                data: { featured: false }
            });
            return res.json({ message: "Listing unfeatured", featured: false });
        } else {
            // 3. "Only One" Logic: Unset all others first
            await prisma.listing.updateMany({
                where: { ownerId: userId },
                data: { featured: false }
            });

            // Set the new one as featured
            const updated = await prisma.listing.update({
                where: { id },
                data: { featured: true }
            });
            return res.json({ message: "Listing marked as featured", listing: updated });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const getAllUserOrders = async (req, res) => {
    try {
        const {userId} = await req.auth();
        
        // Ensure user exists
        await ensureUserExists(userId);
        
        let orders = await prisma.transaction.findMany({
            where: {userId, isPaid: true},
            include: {listing: true},            
        })

        if(!orders || orders.length === 0){
            return res.json({orders: []});
        }
        //attach the credential to each order
        
        const credentials = await prisma.credential.findMany({
            where: {listingId: {in: orders.map((order) => order.listingId)}},
        })

        const ordersWithCredentials = orders.map((order) => {
            const credential = credentials.find((cred) => cred.listingId === order.listingId);
            return {...order,credential}           
        });


        return res.json({orders: ordersWithCredentials});


    } catch (error) {
        console.log(error);
        res.status(500).json({message: error.code || error.message});
    }
}


export const withdrawAmount = async (req, res) => {
    try {
        const {userId} = await req.auth();
        const {amount,account} = req.body;

        const user=await prisma.user.findUnique({
            where: {id: userId},
        })
        
        if (!user) {
            return res.status(400).json({message: "User profile not synced yet"});
        }
        
        const balance=user.earned - user.withdrawn;

        if(amount > balance){
            return res.status(400).json({message: "Insufficient balance"});
        }
        const withdrawal = await prisma.withdrawal.create({
            data: {
                userId,
                amount,
                account,
            }
        })
        await prisma.user.update({
            where: {id: userId},
            data: {withdrawn: {increment: amount}},
        })

        return res.json({message: "Applied for withdrawal", withdrawal});
        
    } catch (error) {
        console.log(error);
        res.status(500).json({message: error.code || error.message});
    }
}


export const purchaseAccount = async (req, res) => {
    
}
