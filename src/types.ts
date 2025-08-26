import type {
	AxiosError,
	AxiosResponse,
	InternalAxiosRequestConfig,
} from 'axios';
import { Collection as CollectionRaw, CollectionType } from '@directus/types';

export type Sort = {
	by: string | null;
	desc: boolean;
};

export interface APIError {
	message: string;
	extensions: {
		code: string;
		[key: string]: any;
	};
}

export interface Collection extends CollectionRaw {
	name: string;
	icon: string;
	type: CollectionType;
	color?: string | null;
}

type RequestConfig = InternalAxiosRequestConfig & { id: string };
type Response = AxiosResponse & { config: RequestConfig };
export type RequestError = AxiosError & { response: Response };