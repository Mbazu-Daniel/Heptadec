import { useQuery } from "@tanstack/react-query";
import { fetchImagesConfig } from "../api";

export function useImagesConfigured(): boolean {
  const config = useQuery({
    queryKey: ["images-config"],
    queryFn: fetchImagesConfig,
  });
  return config.data?.configured ?? true;
}
