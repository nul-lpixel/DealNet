import express from 'express'
import { protectAdmin } from '../middlewares/authMiddleware.js';
import { changeCredential, changeStatus, getAllListings, getAllTransactions, getAllUnchangedListings, getAllUnverifiedListings, getAllWithdrawRequests, getCredential, getDashboard, isAdmin, markCredentialAVerified, markWithdrawalAsPaid } from '../controllers/adminController.js';


const adminRouter = express.Router();

adminRouter.get('/isAdmin',protectAdmin, isAdmin)
adminRouter.get('/dashboard',protectAdmin, getDashboard)
adminRouter.get('/all-listings',protectAdmin, getAllListings)
adminRouter.put('/change-status/:listingId',protectAdmin, changeStatus)
adminRouter.get('/unverified-listings',protectAdmin, getAllUnverifiedListings)
adminRouter.get('/credential/:listingId',protectAdmin, getCredential)
adminRouter.put('/verify-credential/:listingId',protectAdmin, markCredentialAVerified)
adminRouter.get('/unchanged-listings',protectAdmin, getAllUnchangedListings)
adminRouter.put('/change-credential/:listingId',protectAdmin, changeCredential)
adminRouter.get('/transactions',protectAdmin, getAllTransactions)
adminRouter.get('/withdraw-requests',protectAdmin, getAllWithdrawRequests)
adminRouter.put('/withdrawal-mark/:id',protectAdmin, markWithdrawalAsPaid)


export default adminRouter