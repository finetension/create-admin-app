import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type {
	AccessMember,
	AccessMembers,
	AccessRole,
} from "../../../../shared/contracts";
import { ApiError, api } from "../../../shared/api";
import {
	Alert,
	AlertDialog,
	Avatar,
	Button,
	Chip,
	ErrorState,
	Form,
	Label,
	ListBox,
	LoadingState,
	Modal,
	QueryEmptyState,
	Select,
	SelectField,
	TextInputField,
	TrashIcon,
	Typography,
	UserPlusIcon,
} from "../../../shared/ui";

const roleOptions = [
	{ value: "member", label: "구성원" },
	{ value: "admin", label: "관리자" },
	{ value: "owner", label: "소유자" },
];

function roleLabel(role: AccessRole) {
	return roleOptions.find((option) => option.value === role)?.label ?? role;
}

function errorMessage(error: unknown): string {
	return error instanceof ApiError
		? error.message
		: "Access 역할을 변경하지 못했습니다.";
}

function MemberRow({
	member,
	isPending,
	onRoleChange,
	onRemove,
}: {
	member: AccessMember;
	isPending: boolean;
	onRoleChange: (role: AccessRole) => void;
	onRemove: () => void;
}) {
	const [draftRole, setDraftRole] = useState(member.role);

	return (
		<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 border-b border-border py-3 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
			<Avatar className="row-span-2" size="sm" variant="soft">
				<Avatar.Fallback>
					{member.email.slice(0, 1).toUpperCase()}
				</Avatar.Fallback>
			</Avatar>
			<Typography.Paragraph
				truncate
				weight="medium"
				onClickCapture={(event) => event.preventDefault()}
			>
				{member.email}
			</Typography.Paragraph>
			<div
				className={`col-start-3 row-span-2 flex items-center ${
					member.bootstrap
						? "sm:col-start-3 sm:col-span-2 sm:justify-self-end"
						: "sm:col-start-4"
				}`}
			>
				{member.bootstrap ? (
					<Chip color="accent" size="sm" variant="soft">
						{roleLabel(member.role)}
					</Chip>
				) : (
					<Modal>
						<Button
							isDisabled={isPending}
							size="sm"
							variant="ghost"
							onPress={() => setDraftRole(member.role)}
						>
							관리
						</Button>
						<Modal.Backdrop>
							<Modal.Container placement="center" size="sm">
								<Modal.Dialog>
									{({ close }) => (
										<>
											<Modal.CloseTrigger />
											<Modal.Header>
												<Modal.Heading>구성원 관리</Modal.Heading>
												<Typography.Paragraph color="muted" size="sm">
													{member.email}
												</Typography.Paragraph>
											</Modal.Header>
											<Modal.Body>
												<Select
													fullWidth
													aria-label={`${member.email} 권한`}
													isDisabled={isPending}
													selectedKey={draftRole}
													onSelectionChange={(key) =>
														setDraftRole(String(key) as AccessRole)
													}
												>
													<Label>권한</Label>
													<Select.Trigger>
														<Select.Value />
														<Select.Indicator />
													</Select.Trigger>
													<Select.Popover>
														<ListBox>
															{roleOptions.map((option) => (
																<ListBox.Item
																	id={option.value}
																	key={option.value}
																	textValue={option.label}
																>
																	{option.label}
																	<ListBox.ItemIndicator />
																</ListBox.Item>
															))}
														</ListBox>
													</Select.Popover>
												</Select>
												<Typography.Paragraph color="muted">
													권한 변경은 Cloudflare Access 정책과 기존 세션에
													반영됩니다.
												</Typography.Paragraph>
											</Modal.Body>
											<Modal.Footer>
												<AlertDialog>
													<Button
														className="me-auto"
														isDisabled={isPending}
														variant="danger"
													>
														<TrashIcon size={16} />
														제거
													</Button>
													<AlertDialog.Backdrop>
														<AlertDialog.Container placement="center">
															<AlertDialog.Dialog>
																<AlertDialog.Header>
																	<AlertDialog.Heading>
																		구성원을 제거할까요?
																	</AlertDialog.Heading>
																</AlertDialog.Header>
																<AlertDialog.Body>
																	<Typography.Paragraph color="muted">
																		{member.email}의 이 프로젝트 역할이
																		제거되고, Cloudflare 계정의 기존 Access
																		세션도 취소됩니다.
																	</Typography.Paragraph>
																</AlertDialog.Body>
																<AlertDialog.Footer>
																	<Button slot="close" variant="secondary">
																		취소
																	</Button>
																	<Button
																		slot="close"
																		isPending={isPending}
																		variant="danger"
																		onPress={onRemove}
																	>
																		제거
																	</Button>
																</AlertDialog.Footer>
															</AlertDialog.Dialog>
														</AlertDialog.Container>
													</AlertDialog.Backdrop>
												</AlertDialog>
												<Button variant="secondary" onPress={close}>
													취소
												</Button>
												<Button
													isDisabled={draftRole === member.role || isPending}
													isPending={isPending}
													onPress={() => {
														onRoleChange(draftRole);
														close();
													}}
												>
													저장
												</Button>
											</Modal.Footer>
										</>
									)}
								</Modal.Dialog>
							</Modal.Container>
						</Modal.Backdrop>
					</Modal>
				)}
			</div>
			{member.bootstrap ? (
				<Typography.Paragraph
					className="col-start-2 row-start-2"
					color="muted"
					size="xs"
				>
					초기 소유자 · 변경 불가
				</Typography.Paragraph>
			) : (
				<Chip
					className="col-start-2 row-start-2 justify-self-start sm:col-start-3 sm:row-start-1 sm:row-span-2 sm:self-center"
					color={member.role === "owner" ? "accent" : "default"}
					size="sm"
					variant="soft"
				>
					{roleLabel(member.role)}
				</Chip>
			)}
		</div>
	);
}

export function AccessMemberManager() {
	const queryClient = useQueryClient();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<AccessRole>("member");
	const members = useQuery({
		queryKey: ["access-members"],
		queryFn: api.accessMembers.list,
		retry: false,
	});
	const mutation = useMutation({
		mutationFn: (
			input:
				| { kind: "set"; email: string; role: AccessRole }
				| { kind: "remove"; email: string },
		) =>
			input.kind === "set"
				? api.accessMembers.setRole(input.email, { role: input.role })
				: api.accessMembers.remove(input.email),
		onSuccess: (data: AccessMembers) => {
			queryClient.setQueryData(["access-members"], data);
			setEmail("");
			setRole("member");
		},
	});

	if (members.isLoading) {
		return <LoadingState label="Access 구성원을 불러오는 중" />;
	}
	if (members.isError || !members.data) {
		return <ErrorState message={errorMessage(members.error)} />;
	}

	return (
		<div className="grid gap-4">
			{mutation.isError && (
				<Alert status="danger">
					<Alert.Content>
						<Alert.Title>구성원 변경 실패</Alert.Title>
						<Alert.Description>
							{errorMessage(mutation.error)}
						</Alert.Description>
					</Alert.Content>
				</Alert>
			)}

			<div className="flex items-end justify-between gap-3">
				<div>
					<Typography.Heading className="text-xl" level={2}>
						현재 구성원
					</Typography.Heading>
					<Typography.Paragraph color="muted" size="xs">
						역할 변경은 Access 정책과 세션에 즉시 반영됩니다.
					</Typography.Paragraph>
				</div>
				<Chip size="sm" variant="soft">
					{members.data.members.length}명
				</Chip>
			</div>
			<section aria-label="Access 구성원" className="border-y border-border">
				{members.data.members.length === 0 ? (
					<QueryEmptyState
						title="구성원이 없습니다"
						description="첫 구성원을 추가하세요."
					/>
				) : (
					members.data.members.map((member) => (
						<MemberRow
							key={member.email}
							member={member}
							isPending={mutation.isPending}
							onRoleChange={(nextRole) =>
								mutation.mutate({
									kind: "set",
									email: member.email,
									role: nextRole,
								})
							}
							onRemove={() =>
								mutation.mutate({
									kind: "remove",
									email: member.email,
								})
							}
						/>
					))
				)}
			</section>

			<section className="grid gap-3">
				<div className="flex items-center gap-2">
					<UserPlusIcon size={18} />
					<div>
						<Typography.Heading className="text-base" level={2}>
							구성원 추가
						</Typography.Heading>
						<Typography.Paragraph color="muted" size="xs">
							이메일과 역할을 선택해 Access에 반영합니다.
						</Typography.Paragraph>
					</div>
				</div>
				<Form
					className="grid gap-3 border-y border-border py-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end"
					onSubmit={(event) => {
						event.preventDefault();
						const normalizedEmail = email.trim().toLowerCase();
						if (!normalizedEmail) return;
						mutation.mutate({
							kind: "set",
							email: normalizedEmail,
							role,
						});
					}}
				>
					<TextInputField
						label="이메일"
						type="email"
						value={email}
						onValueChange={setEmail}
						required
						isDisabled={mutation.isPending}
						placeholder="teammate@example.com"
					/>
					<SelectField
						label="역할"
						value={role}
						options={roleOptions}
						onValueChange={(value) => setRole(value as AccessRole)}
						isDisabled={mutation.isPending}
					/>
					<Button
						type="submit"
						variant="primary"
						isPending={mutation.isPending}
					>
						<UserPlusIcon size={18} />
						추가
					</Button>
				</Form>
			</section>
		</div>
	);
}
