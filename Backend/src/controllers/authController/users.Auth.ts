import { asyncHandler } from "../../utils/asyncHandler.js";
import { Request, Response } from "express";

export const RegisterUser = asyncHandler(
    async (req: Request, res: Response) => {
        const { name, email, password } = req.body;

        const Existing = await user.findOne({ email });

        if (Existing) {
            return res.status(400).json({
                message: "Email already registered."
            });
        };


    });
