import { updateUserProfile, type UserProfileUpdate } from "../model/user_model.js";
import { login, registerStudent } from "./auth_service.js";
import type { LoginInput, StudentRegisterInput } from "../types/users_type.js";

export const loginUserService = (input: LoginInput) => login(input);
export const registerUserService = (input: StudentRegisterInput) => registerStudent(input);

export async function updateUserService(userId: number, input: UserProfileUpdate) {
    const result = await updateUserProfile(userId, input);
    return result.rows[0] ?? null;
}
